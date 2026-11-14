import { sha256 } from "@noble/hashes/sha2.js";

import { decodeHex, encodeHex } from "../chain/hex";
import { baseUnits } from "../chain/integers";
import type { Outpoint } from "../chain/outpoint";
import { byOutpoint, outpointKey } from "../chain/outpoint";
import { confirmationModel, type ReviewedPlan } from "../confirmation";
import {
	type Action,
	type Input,
	Manifest,
	type ProgramInput,
	programInputs,
	programOutputs,
} from "../document/manifest";
import { refuseUnsupported } from "../document/refuse";
import type { Blinding, Issuance, ProgramReference } from "../document/schema";
import {
	type AssetLedger,
	assetLedger,
	type HeldValue,
	resolveAsset,
} from "../evaluation/assetLedger";
import { type BlindingDecision, resolveChangeBlinding } from "../evaluation/blinding";
import { type BlindingFactors, resolveBlindingFactors } from "../evaluation/blindingFactors";
import { inputHookScope, runHook, withHookValues } from "../evaluation/hooks";
import { type InputPlacement, type PlaceableInput, placeInputs } from "../evaluation/inputOrder";
import { type InputRule, resolveInputRules } from "../evaluation/inputRules";
import {
	issuanceAttributes,
	reissuanceOf,
	type PlannedIssuance,
	issuanceIdentity,
	withIssuedAmounts,
} from "../evaluation/issuance";
import { fillParameters } from "../evaluation/parameters";
import { type PlannedSpend, planAction, resolveAmount } from "../evaluation/plan";
import { checkPositions, type StatedPosition } from "../evaluation/positions";
import {
	checkWitnessNames,
	resolveStaticWitnesses,
	signatureWitness,
	unusedWitnesses,
} from "../evaluation/witness";
import {
	type CreatedInstance,
	resolveCreatedInstance,
	statedCreatedFields,
} from "../programs/instance";
import {
	checkProgramOnChain,
	type ProgramDerivation,
	deriveProgramAddress,
} from "../programs/program";
import { programHashFrom } from "../programs/programHash";
import { Refusal } from "../refusal";
import type { ParsedLiquidProcessCtParams } from "../request/request";
import { missingParts } from "../request/requirements";
import { Scope } from "../values/scope";
import { type AssetHoldings, type FundedAsset, fundAssets } from "./assetFunding";
import { type SelectableUtxo, toSats } from "./coinSelection";
import type {
	AssetMovement,
	ProgramFinding,
	ManifestReview,
	PlannedInput,
	ReviewedProgramInput,
	ReviewedOutput,
	ReviewInput,
	TransactionDraft,
} from "./index";
import { ProgramUtxos } from "./programUtxos";

type PaidOutputs = {
	at: Map<string, number>;
	droppedSats: bigint;
	outputs: ReviewedOutput[];
	returned: Map<string, bigint>;
};

type PlacedInputs = {
	landedAt: (id: string) => number | undefined;
	placement: InputPlacement<PlannedInput>;
	selected: SelectableUtxo[];
};

export class ActionReview {
	readonly #request: ParsedLiquidProcessCtParams;
	readonly #input: ReviewInput;
	readonly #manifest: Manifest;
	readonly #pinned: Record<string, Outpoint>;
	readonly #action: Action;
	readonly #includeDebugSymbols: boolean;
	readonly #declaredTypes: Record<string, string>;
	readonly #witnessTypes = new Map<string, Record<string, string>>();
	readonly #policyAsset: string;
	readonly #mayReturn: (asset: string) => boolean;
	readonly #pools = new Map<string, SelectableUtxo[]>();
	readonly #chainHeld: HeldValue[] = [];
	readonly #programs: ProgramFinding[] = [];
	readonly #programInputs: ReviewedProgramInput[] = [];
	#scope: Scope;

	private constructor(request: ParsedLiquidProcessCtParams, input: ReviewInput) {
		this.#request = request;
		this.#input = input;
		this.#manifest = Manifest.parse(request.manifest);
		this.#pinned = request.instance?.provided_inputs ?? {};
		this.#policyAsset = input.policyAsset;

		const unsupported = refuseUnsupported(this.#manifest, {
			...(input.compilerVersion === undefined ? {} : { compilerVersion: input.compilerVersion }),
			contractSources: request.contractSources,
		});

		if (unsupported) {
			throw unsupported;
		}

		const action = this.#manifest.action(request.action);

		if (!action) {
			throw new Refusal(
				`The manifest declares no action named "${request.action}".`,
				"no-such-action",
			);
		}

		this.#action = action;

		this.#mayReturn = (asset) =>
			action.allow_change === "any" ||
			(action.allow_change === "lbtc_only" && asset === this.#policyAsset);
		this.#includeDebugSymbols = this.#manifest.includeDebugSymbols;

		const fields = request.instance?.instance?.fields ?? {};
		const supplied = withoutDeployedFields(action, request.params, fields);
		const params = fillParameters(
			action,
			supplied,
			new Scope({ instance: fields, params: supplied }),
			{
				address: input.walletAddress,
				key: input.walletKey,
				script_hash: encodeHex(sha256(walletScript(input.walletScriptPubKeyHex))),
			},
		);
		const missing = missingParts({ ...request, params }, this.#manifest, action);

		if (missing.length > 0) {
			const named = missing
				.map((entry) => (entry.keys ? `${entry.reason} (${entry.keys.join(", ")})` : entry.reason))
				.join(" ");

			throw new Refusal(`This request cannot be built. ${named}`, "incomplete-request");
		}

		const stated = statedCreatedFields(action, new Scope({ instance: fields, params }));

		this.#declaredTypes = this.#manifest.paramTypes(action);
		this.#scope = new Scope({ instance: { ...fields, ...stated }, params });
	}

	static run(request: ParsedLiquidProcessCtParams, input: ReviewInput): Promise<ManifestReview> {
		return new ActionReview(request, input).#run();
	}

	async #run(): Promise<ManifestReview> {
		await this.#spendPrograms();

		const identified = resolveIssuances(this.#action, {
			programInputs: this.#programInputs,
			holdings: (asset) => this.#holdings(asset),
			policyAsset: this.#input.policyAsset,
			scope: this.#scope,
		});

		this.#scope = runActionHooks(this.#action, identified.scope);

		const issued: ResolvedIssuances = {
			issuances: identified.identities.map(({ declared, planned }) =>
				withIssuedAmounts(planned, declared, this.#scope),
			),
			reserved: identified.reserved,
		};

		const created = this.#createInstance();

		await this.#createPrograms();
		this.#attachWitnessValues();

		this.#scope = this.#scope.withFee(MIN_FEE_SATS);
		planAction(this.#action, this.#scope, this.#declaredTypes);

		const rules = resolveInputRules(this.#action, this.#scope);
		const feeRateSatsPerKvb = await this.#feeRate();
		const locktimeHeight = await this.#locktimeHeight();
		const timing = locktimeHeight === undefined ? {} : { locktimeHeight };
		let settled = await this.#settle(issued, rules, timing, feeRateSatsPerKvb);

		for (let round = 1; settled.feeSats > (this.#scope.fee ?? 0n); round += 1) {
			if (round === FEE_ROUNDS) {
				throw new Refusal(
					`The fee for "${this.#request.action}" kept rising as this wallet funded the ` +
						"action, so the wallet cannot say what the transaction costs.",
					"built-something-else",
				);
			}

			this.#scope = this.#scope.withFee(settled.feeSats);
			// oxlint-disable-next-line no-await-in-loop
			settled = await this.#settle(issued, rules, timing, feeRateSatsPerKvb);
		}

		const { draft, ledger, paid, placed } = settled;
		const estimatedFeeSats = (this.#scope.fee ?? 0n) + paid.droppedSats;

		const reviewed: ReviewedPlan = {
			...draft,
			...(this.#action.template === undefined ? {} : { boundTo: this.#action.template }),
			programInputs: this.#programInputs,
			programs: this.#programs,
			...(created === undefined ? {} : { createdInstance: created }),
			estimatedFeeSats,
			feeRateSatsPerKvb,
			movements: this.#movements(ledger, paid.returned, estimatedFeeSats),
			policyAsset: this.#policyAsset,
			protocol: this.#manifest.protocol ?? "",
			selected: placed.selected,
		};

		return {
			...reviewed,
			confirmation: confirmationModel(reviewed, this.#manifest, this.#action, {
				accountLabel: this.#input.accountLabel,
				policyAsset: this.#input.policyAsset,
				scope: this.#scope,
			}),
		};
	}

	async #settle(
		issued: ResolvedIssuances,
		rules: InputRule[],
		timing: Pick<TransactionDraft, "locktimeHeight">,
		feeRateSatsPerKvb: number,
	) {
		const plan = planAction(this.#action, this.#scope, this.#declaredTypes);
		const ledger = this.#ledger(plan, issued);

		const funded = this.#fund(ledger, rules, issued);
		const paid = this.#payOutputs(plan, ledger, funded);
		const placed = this.#placeInputs(ledger, funded, rules, issued.reserved);

		this.#checkPositions(placed, paid);

		const draft: TransactionDraft = {
			action: this.#request.action,
			inputOrder: placed.placement.order,
			issuances: issued.issuances,
			outputs: paid.outputs,
			...timing,
		};

		return { draft, feeSats: await this.#estimate(draft, feeRateSatsPerKvb), ledger, paid, placed };
	}

	async #estimate(draft: TransactionDraft, feeRateSatsPerKvb: number): Promise<bigint> {
		try {
			return await this.#input.estimateFee(draft, feeRateSatsPerKvb);
		} catch (error) {
			if (error instanceof Refusal) {
				throw error;
			}

			throw new Refusal(
				`This wallet could not price "${draft.action}": ${String(error)}`,
				"built-something-else",
			);
		}
	}

	#holdings(asset: string): SelectableUtxo[] {
		const existing = this.#pools.get(asset);

		if (existing) {
			return existing;
		}

		const pool =
			asset === this.#policyAsset
				? this.#input.fundingUtxos
				: (this.#input.holdingsOf?.(asset) ?? []);

		this.#pools.set(asset, pool);

		return pool;
	}

	#derive(reference: ProgramReference): Promise<ProgramDerivation> {
		return deriveProgramAddress(this.#manifest, {
			compile: this.#input.compile,
			programAbi: this.#input.programAbi,
			contractSources: this.#request.contractSources,
			declaredTypes: this.#declaredTypes,
			includeDebugSymbols: this.#includeDebugSymbols,
			network: this.#input.network,
			reference,
			scope: this.#scope,
		});
	}

	async #spendPrograms(): Promise<void> {
		const utxos = new ProgramUtxos(this.#request.state, this.#pinned);

		for (const input of programInputs(this.#action)) {
			const id = input.label;
			const utxoType = input.utxo_source.utxo_type;

			if (input.id === undefined) {
				throw new Refusal(
					`The ${utxoType} spent by input ${id} is given no id, so this wallet cannot ` +
						"account for what it brings.",
				);
			}

			// oxlint-disable-next-line no-await-in-loop
			const derived = await this.#derive(input.utxo_source);
			const asset = resolveAsset(input.asset, `input ${id}`, {
				policyAsset: this.#input.policyAsset,
				scope: this.#scope,
			});
			const outpoint = utxos.claim(id, utxoType, asset);
			// oxlint-disable-next-line no-await-in-loop
			const onChain = await this.#readTxOut(outpoint);

			checkProgramOnChain(derived, onChain.scriptPubKeyHex);

			const holding =
				input.blinding !== undefined
					? this.#blindedHolding({ ...input, blinding: input.blinding })
					: onChain.amountSats !== undefined && onChain.rawAssetId !== undefined
						? explicitHolding(utxoType, outpoint, onChain.amountSats, onChain.rawAssetId)
						: // oxlint-disable-next-line no-await-in-loop
							await this.#reopenedHolding(input, outpoint, onChain.transactionHex);
			const signature = signatureWitness(input);
			const unused = unusedWitnesses(input);

			checkWitnessNames(input, derived.witnessTypes);
			this.#witnessTypes.set(id, derived.witnessTypes);
			this.#scope = this.#scope.withInput(id, { amount_sat: holding.sats, asset: holding.asset });
			this.#chainHeld.push({ asset: holding.asset, id, sats: holding.sats });
			this.#programInputs.push({
				argumentsJson: derived.argumentsJson,
				extraLeavesJson: derived.extraLeavesJson,
				id,
				includeDebugSymbols: derived.includeDebugSymbols,
				...(signature === undefined ? {} : { signatureWitness: signature }),
				...(holding.blindingSecretsJson === undefined
					? {}
					: { blindingSecretsJson: holding.blindingSecretsJson }),
				source: derived.source,
				txOutHex: onChain.txOutHex,
				txid: outpoint.txid,
				...(unused.length === 0 ? {} : { unusedWitnesses: unused }),
				utxoType,
				vout: outpoint.vout,
			});
			this.#programs.push({ ...derived, role: "spent", verified: "matches-chain" });
		}
	}

	async #locktimeHeight(): Promise<number | undefined> {
		if (this.#programInputs.length === 0 || !this.#input.readChainTip) {
			return undefined;
		}

		try {
			return await this.#input.readChainTip();
		} catch (error) {
			throw new Refusal(
				`Could not read the chain's height, which a transaction spending a program is ` +
					`locked to: ${String(error)}`,
				"chain-read-failed",
			);
		}
	}

	#readAddress(address: string): ReturnType<ReviewInput["readAddress"]> {
		try {
			return this.#input.readAddress(address);
		} catch (error) {
			throw new Refusal(
				`${address} is not an address this wallet can pay on ${this.#input.network}: ${String(error)}`,
			);
		}
	}

	#blindedHolding(input: ProgramInput & { blinding: Blinding }): Holding {
		const at = `Input ${input.label}`;
		const { assetBlindingFactor, valueBlindingFactor } = Refusal.amend(
			() => resolveBlindingFactors(input.blinding, this.#scope),
			(reason) => `${at} ${reason}`,
		);

		if (assetBlindingFactor === undefined || valueBlindingFactor === undefined) {
			throw new Refusal(
				`${at} states only one blinding factor of the output it spends, and a blinded output ` +
					"opens only with both.",
			);
		}

		const asset = resolveAsset(input.asset, `input ${input.label}`, {
			policyAsset: this.#input.policyAsset,
			scope: this.#scope,
		});
		const sats = Refusal.amend(
			() => resolveAmount(exactAmount(input), this.#scope),
			(reason) =>
				`${at} spends a blinded output, which states its amount only through amount_sat: ${reason}`,
		);

		return {
			asset,
			blindingSecretsJson: JSON.stringify({
				asset,
				assetBlindingFactor,
				value: sats.toString(),
				valueBlindingFactor,
			}),
			sats,
		};
	}

	async #reopenedHolding(
		input: ProgramInput,
		outpoint: Outpoint,
		transactionHex: string | undefined,
	): Promise<Holding> {
		const utxoType = input.utxo_source.utxo_type;
		const opened =
			transactionHex === undefined
				? undefined
				: await this.#input.unblind?.(transactionHex, outpoint.vout);

		if (!opened) {
			throw new Refusal(
				`The ${utxoType} at ${outpoint.txid}:${outpoint.vout} is blinded to a key this ` +
					`wallet does not hold, and input ${input.label} states no blinding factors to open it ` +
					"with. This wallet will not assume a balance for an output it is about to spend.",
				"unbuildable-utxo-type",
			);
		}

		const declaredAsset =
			input.asset === undefined
				? undefined
				: resolveAsset(input.asset, `input ${input.label}`, {
						policyAsset: this.#input.policyAsset,
						scope: this.#scope,
					});
		const stated = exactAmount(input);
		const declaredSats = stated === undefined ? undefined : resolveAmount(stated, this.#scope);

		if (
			(declaredAsset !== undefined && declaredAsset !== opened.asset) ||
			(declaredSats !== undefined && declaredSats !== opened.sats)
		) {
			throw new Refusal(
				`Input ${input.label} expects ${declaredSats ?? "an amount"} of ${declaredAsset ?? "an asset"}, ` +
					`and the ${utxoType} it spends holds ${opened.sats} of ${opened.asset}.`,
				"program-mismatch",
			);
		}

		return {
			asset: opened.asset,
			blindingSecretsJson: JSON.stringify({
				asset: opened.asset,
				assetBlindingFactor: opened.assetBlindingFactor,
				value: opened.sats.toString(),
				valueBlindingFactor: opened.valueBlindingFactor,
			}),
			sats: opened.sats,
		};
	}

	async #readTxOut(outpoint: Outpoint) {
		try {
			return await this.#input.readTxOut(outpoint);
		} catch (error) {
			throw new Refusal(
				`Could not read what is at ${outpoint.txid}:${outpoint.vout}: ${String(error)}`,
				"chain-read-failed",
			);
		}
	}

	#createInstance(): CreatedInstance | undefined {
		if (this.#action.create_instance === undefined) {
			return undefined;
		}

		const created = resolveCreatedInstance(this.#action, {
			contractSources: this.#request.contractSources,
			hashProgram: programHashFrom(this.#input.scriptPubKeyOf, this.#includeDebugSymbols),
			scope: this.#scope,
		});

		this.#scope = this.#scope.withInstance(created.fields);

		return created;
	}

	async #createPrograms(): Promise<void> {
		for (const output of programOutputs(this.#action)) {
			// oxlint-disable-next-line no-await-in-loop
			const derived = await this.#derive(output.reference);

			this.#programs.push({ ...derived, role: "created", verified: "not-yet-onchain" });
		}
	}

	#attachWitnessValues(): void {
		const stated = resolveStaticWitnesses(this.#action, this.#scope);

		for (const program of this.#programInputs) {
			const values = stated.get(program.id);
			const types = this.#witnessTypes.get(program.id) ?? {};

			if (values && values.length > 0) {
				program.witnessValues = values.map(({ name, value }) => ({
					name,
					type: types[name] ?? "",
					value,
				}));
			}
		}
	}

	async #feeRate(): Promise<number> {
		let rate: number;

		try {
			rate = await this.#input.readFeeRate(FEE_TARGET_BLOCKS);
		} catch (error) {
			throw new Refusal(
				`The wallet could not establish a fee rate, so it will not build this: ${String(error)}`,
				"no-fee-rate",
			);
		}

		if (!Number.isFinite(rate) || rate < 0) {
			throw new Refusal(
				`The wallet was given ${rate} as a fee rate, which is not a rate anything ` +
					"can be charged at. It will not build a transaction it cannot price.",
				"no-fee-rate",
			);
		}

		return rate;
	}

	#ledger(plan: PlannedSpend, issued: ResolvedIssuances): AssetLedger {
		return assetLedger(this.#action, plan.outputs, {
			held: [
				...this.#chainHeld,
				...issued.issuances.flatMap((issuance) =>
					[
						{ asset: issuance.asset, sats: issuance.assetAmountSats },
						{ asset: issuance.reissuanceToken, sats: issuance.inflationAmountSats },
					]
						.filter(({ sats }) => sats > 0n)
						.map(({ asset, sats }) => ({
							asset,
							created: true as const,
							id: issuance.inputId,
							sats,
						})),
				),
			],
			policyAsset: this.#input.policyAsset,
			scope: this.#scope,
		});
	}

	#fund(ledger: AssetLedger, rules: InputRule[], issued: ResolvedIssuances): FundedAsset[] {
		const pinFor = new Map<string, string>();

		for (const rule of rules) {
			if (rule.fromAddress !== undefined) {
				pinFor.set(rule.id, this.#readAddress(rule.fromAddress).scriptPubKeyHex);
			}
		}

		const fundedInput = new Set(ledger.walletInputs.map((wallet) => wallet.id));

		for (const [id, script] of pinFor) {
			if (!fundedInput.has(id)) {
				throw new Refusal(
					`This action requires input ${id} to be funded from ${script}, and that input is ` +
						"not one this wallet funds out of its own outputs.",
				);
			}
		}

		const pinnedAsset = new Map<string, { id: string; script: string }>();

		for (const wallet of ledger.walletInputs) {
			const script = pinFor.get(wallet.id);

			if (script === undefined) {
				continue;
			}

			const already = pinnedAsset.get(wallet.asset);

			if (already && !sameScript(already.script, script)) {
				throw new Refusal(
					`This action requires input ${already.id} to be funded from ${already.script} and ` +
						`input ${wallet.id} from ${script}, and both are funded in ${wallet.asset} out of ` +
						"one selection. This wallet cannot fund one run of outputs from two places.",
					"no-funds-at-signing-address",
				);
			}

			pinnedAsset.set(wallet.asset, { id: wallet.id, script });
		}

		const pinnedHoldings: AssetHoldings = (asset) => {
			const pin = pinnedAsset.get(asset);

			return pin === undefined
				? this.#holdings(asset)
				: this.#holdings(asset).filter((utxo) =>
						sameScript(utxo.scriptPubKeyHex ?? "", pin.script),
					);
		};

		for (const [asset, pin] of pinnedAsset) {
			const committed = issued.reserved.some((held) => held.asset === asset);

			if (pinnedHoldings(asset).length === 0 && !committed) {
				throw new Refusal(
					`This action must fund input ${pin.id} from ${pin.script}, and this wallet holds ` +
						`nothing in ${asset} there.`,
					"no-funds-at-signing-address",
				);
			}
		}

		const misplaced = issued.reserved.find((held) => {
			const script = pinFor.get(held.inputId);

			return script !== undefined && !sameScript(held.utxo.scriptPubKeyHex ?? "", script);
		});

		if (misplaced) {
			throw new Refusal(
				`This action must fund input ${misplaced.inputId} from ` +
					`${pinFor.get(misplaced.inputId) ?? ""}, and the output it issues an asset from is not ` +
					"there.",
				"no-funds-at-signing-address",
			);
		}

		return fundAssets(ledger.entries, {
			feeSats: this.#scope.fee ?? 0n,
			floors: this.#minimums(ledger, issued.reserved),
			holdings: pinnedHoldings,
			mayReturn: this.#mayReturn,
			policyAsset: this.#input.policyAsset,
			reserved: issued.reserved,
		});
	}

	#minimums(ledger: AssetLedger, reserved: ReservedFunding): Map<string, bigint> {
		const assetOf = new Map(ledger.walletInputs.map((wallet) => [wallet.id, wallet.asset]));
		const floors = new Map<string, bigint>();

		for (const input of this.#action.inputs) {
			const stated = input.utxo_source === "wallet" ? walletAmount(input, this.#scope) : undefined;
			const asset = assetOf.get(input.label);

			if (
				stated === undefined ||
				stated.exact ||
				asset === undefined ||
				reserved.some((held) => held.inputId === input.label)
			) {
				continue;
			}

			floors.set(asset, (floors.get(asset) ?? 0n) + stated.sats);
		}

		return floors;
	}

	#payOutputs(plan: PlannedSpend, ledger: AssetLedger, funded: FundedAsset[]): PaidOutputs {
		const changeFor = new Map(funded.map((entry) => [entry.asset, entry.changeSats]));
		const spendsConfidential =
			this.#programInputs.some((program) => program.blindingSecretsJson !== undefined) ||
			funded.some((entry) => entry.selected.some((utxo) => utxo.confidential === true));
		const programScripts = new Map(
			this.#programs.map((found) => [found.utxoType, found.scriptPubKeyHex]),
		);
		const paid: PaidOutputs = {
			at: new Map(),
			droppedSats: 0n,
			outputs: [],
			returned: new Map(),
		};

		const payChange = (
			asset: string,
			id: string,
			planned: BlindingDecision,
			factors?: BlindingFactors,
		) => {
			const sats = changeFor.get(asset) ?? 0n;

			changeFor.delete(asset);

			if (sats <= 0n) {
				return;
			}

			const isPolicy = asset === this.#policyAsset;

			if (isPolicy && sats < DUST_SATS) {
				paid.droppedSats = sats;

				return;
			}

			const blinding = isPolicy ? resolveChangeBlinding(planned, spendsConfidential) : planned;
			const blinded = blinding.blinding === "blinded";

			paid.at.set(id, paid.outputs.length);
			paid.outputs.push({
				asset,
				blinded,
				...chosenFactors(id, factors, blinded),
				decidedBy: blinding.decidedBy,
				id,
				...(blinding.overrode === undefined ? {} : { overrode: blinding.overrode }),
				sats,
				scriptPubKeyHex: this.#input.walletScriptPubKeyHex,
			});
		};

		for (const [at, planned] of plan.outputs.entries()) {
			const asset = ledger.outputs[at] ?? this.#policyAsset;

			if (planned.target.kind === "change") {
				payChange(asset, planned.id, planned.blinding, planned.factors);

				continue;
			}

			if (planned.sats === undefined) {
				continue;
			}

			if (planned.target.kind === "address") {
				const { blindingPublicKeyHex, scriptPubKeyHex } = this.#readAddress(planned.target.address);
				const blinds = planned.blinding.blinding === "blinded";

				if (
					blinds &&
					blindingPublicKeyHex === undefined &&
					planned.blinding.decidedBy === "output"
				) {
					throw new Refusal(
						`Output ${planned.id} must be blinded and pays ${planned.target.address}, ` +
							"an address that carries no blinding key to blind it with.",
					);
				}

				const blinded = blinds && blindingPublicKeyHex !== undefined;

				paid.at.set(planned.id, paid.outputs.length);
				paid.outputs.push({
					address: planned.target.address,
					asset,
					blinded,
					...(blinded ? { blindingPublicKeyHex } : {}),
					...chosenFactors(planned.id, planned.factors, blinded),
					decidedBy: blinded ? planned.blinding.decidedBy : "unblindable",
					id: planned.id,
					sats: planned.sats,
					scriptPubKeyHex,
				});

				continue;
			}

			const scriptPubKeyHex =
				planned.target.kind === "program"
					? programScripts.get(planned.target.utxoType)
					: planned.target.kind === "data"
						? planned.target.hex
						: this.#input.walletScriptPubKeyHex;

			if (!scriptPubKeyHex) {
				throw new Refusal(
					`Output ${planned.id} pays a program the wallet did not verify.`,
					"program-mismatch",
				);
			}

			if (planned.target.kind === "wallet") {
				paid.returned.set(asset, (paid.returned.get(asset) ?? 0n) + planned.sats);
			}

			const blinded = planned.blinding.blinding === "blinded";

			paid.at.set(planned.id, paid.outputs.length);
			paid.outputs.push({
				asset,
				blinded,
				...chosenFactors(planned.id, planned.factors, blinded),
				decidedBy: planned.blinding.decidedBy,
				id: planned.id,
				sats: planned.sats,
				scriptPubKeyHex,
			});
		}

		for (const asset of changeFor.keys()) {
			payChange(asset, "change", UNDECLARED_CHANGE);
		}

		return paid;
	}

	#placeInputs(
		ledger: AssetLedger,
		funded: FundedAsset[],
		rules: InputRule[],
		reserved: ResolvedIssuances["reserved"],
	): PlacedInputs {
		const reservedFor = new Map(reserved.map((held) => [held.inputId, held.utxo]));
		const unreserved = (asset: string) =>
			(fundedFor.get(asset)?.selected ?? []).filter(
				(utxo) => !reserved.some((held) => outpointKey(held.utxo) === outpointKey(utxo)),
			);
		const sequenceOf = new Map(rules.map((rule) => [rule.id, rule.sequence]));
		const withSequence = (id: string) => {
			const sequence = sequenceOf.get(id);

			return sequence === undefined ? {} : { sequence };
		};
		const fundedFor = new Map(funded.map((entry) => [entry.asset, entry]));
		const fundedOrder = [
			...new Set([
				...ledger.walletInputs.map((wallet) => wallet.asset),
				...funded.map((entry) => entry.asset),
			]),
		];
		const creditedWith = new Map<string, string>();
		const fundedWith = new Map<string, string>();
		const walletRuns = new Map<string, PlannedInput[]>();

		for (const wallet of ledger.walletInputs) {
			const own = reservedFor.get(wallet.id);

			if (own) {
				walletRuns.set(wallet.id, [
					Object.assign({ source: "wallet" as const, utxo: own }, withSequence(wallet.id)),
				]);

				continue;
			}

			const credited = creditedWith.get(wallet.asset);

			if (credited !== undefined) {
				if (sequenceOf.get(wallet.id) !== sequenceOf.get(credited)) {
					throw new Refusal(
						`Inputs ${credited} and ${wallet.id} are funded from one selection of this ` +
							"wallet's outputs and ask for different sequences, so this wallet cannot " +
							"say which of those outputs waits for which.",
						"unimplemented-construct",
					);
				}

				fundedWith.set(wallet.id, credited);

				continue;
			}

			const waits = withSequence(wallet.id);

			creditedWith.set(wallet.asset, wallet.id);
			walletRuns.set(
				wallet.id,
				unreserved(wallet.asset).map((utxo) =>
					Object.assign({ source: "wallet" as const, utxo }, waits),
				),
			);
		}

		const placeable: PlaceableInput<PlannedInput>[] = [];

		for (const { label: id, required_index: wanted } of this.#action.inputs) {
			const program = this.#programInputs.find((candidate) => candidate.id === id);

			placeable.push({
				id,
				slots: program
					? [{ program, source: "program", ...withSequence(id) }]
					: (walletRuns.get(id) ?? []),
				...(wanted === undefined ? {} : { stated: wanted }),
			});
		}

		const undeclared = fundedOrder
			.filter((asset) => !creditedWith.has(asset))
			.flatMap((asset) => unreserved(asset));

		if (undeclared.length > 0) {
			placeable.push({ slots: undeclared.map((utxo) => ({ source: "wallet" as const, utxo })) });
		}

		const placement = placeInputs(placeable);

		return {
			landedAt: (id) => {
				const own = placement.at.get(id);

				if (own !== undefined) {
					return own;
				}

				const credited = fundedWith.get(id);
				const start = credited === undefined ? undefined : placement.at.get(credited);

				return start === undefined
					? undefined
					: start + (walletRuns.get(credited ?? "")?.length ?? 0);
			},
			placement,
			selected: fundedOrder.flatMap((asset) => fundedFor.get(asset)?.selected ?? []),
		};
	}

	#checkPositions(placed: PlacedInputs, paid: PaidOutputs): void {
		const positions: StatedPosition[] = [];

		for (const { label: id, required_index: stated } of this.#action.inputs) {
			if (stated !== undefined) {
				positions.push({
					at: placed.landedAt(id) ?? placed.placement.order.length,
					id,
					kind: "input",
					stated,
				});
			}
		}

		for (const { id, required_index: stated } of this.#action.outputs) {
			if (stated === undefined) {
				continue;
			}

			if (id === undefined) {
				throw new Refusal(
					`This action states a position for an output the manifest gives no id, so this ` +
						"wallet cannot say which output it is or where it landed.",
					"unbuildable-position",
				);
			}

			positions.push({ at: paid.at.get(id) ?? paid.outputs.length, id, kind: "output", stated });
		}

		checkPositions(positions, {
			inputs: placed.placement.order.length,
			outputs: paid.outputs.length,
		});
	}

	#movements(
		ledger: AssetLedger,
		returned: Map<string, bigint>,
		estimatedFeeSats: bigint,
	): AssetMovement[] {
		return ledger.entries.map((entry) => ({
			asset: entry.asset,
			sats:
				entry.held -
				entry.needed +
				(returned.get(entry.asset) ?? 0n) -
				(entry.asset === this.#policyAsset ? estimatedFeeSats : 0n),
		}));
	}
}

const FEE_TARGET_BLOCKS = 1;

const FEE_ROUNDS = 4;

const MIN_FEE_SATS = 10n;

const DUST_SATS = 22n;

type Holding = { asset: string; blindingSecretsJson?: string; sats: bigint };

function explicitHolding(
	utxoType: string,
	outpoint: Outpoint,
	amountSats: string,
	asset: string,
): Holding {
	const sats = baseUnits(amountSats);

	if (sats === undefined) {
		throw new Refusal(
			`The ${utxoType} at ${outpoint.txid}:${outpoint.vout} came back holding ` +
				`${JSON.stringify(amountSats)}, which is not an amount this wallet can read. It will ` +
				"not spend an output it cannot say the value of.",
			"unbuildable-utxo-type",
		);
	}

	return { asset, sats };
}

function chosenFactors(
	id: string,
	factors: BlindingFactors | undefined,
	blinded: boolean,
): BlindingFactors {
	if (factors === undefined) {
		return {};
	}

	if (!blinded) {
		throw new Refusal(
			`Output ${id || "(unnamed)"} chooses blinding factors and is not blinded, so nothing ` +
				"would blind it with them.",
		);
	}

	return factors;
}

const UNDECLARED_CHANGE: BlindingDecision = {
	blinding: "open",
	decidedBy: "spendable-change",
	overrode: "chain",
};

type ReservedFunding = { asset: string; inputId: string; utxo: SelectableUtxo }[];

type IdentifiedIssuances = {
	identities: { declared: Issuance; planned: PlannedIssuance }[];
	reserved: ReservedFunding;
	scope: Scope;
};

type ResolvedIssuances = { issuances: PlannedIssuance[]; reserved: ReservedFunding };

function resolveIssuances(
	action: Action,
	context: {
		programInputs: ReviewedProgramInput[];
		holdings: AssetHoldings;
		policyAsset: string;
		scope: Scope;
	},
): IdentifiedIssuances {
	let { scope } = context;
	const identities: IdentifiedIssuances["identities"] = [];
	const reserved: ReservedFunding = [];
	const policyAsset = context.policyAsset;
	const pools = new Map<string, SelectableUtxo[]>();
	const taken = new Set<string>();

	const candidatesIn = (asset: string): SelectableUtxo[] => {
		const existing = pools.get(asset);

		if (existing) {
			return existing;
		}

		const ordered = byOutpoint(context.holdings(asset).filter((utxo) => utxo.spendable)).toSorted(
			(one, other) => bySize(toSats(one), toSats(other), asset === policyAsset),
		);

		pools.set(asset, ordered);

		return ordered;
	};

	for (const input of action.inputs) {
		const { issuance, label: id } = input;
		const stated = input.utxo_source === "wallet" ? walletAmount(input, scope) : undefined;
		const fits = (utxo: SelectableUtxo) =>
			stated === undefined ||
			(stated.exact ? toSats(utxo) === stated.sats : toSats(utxo) >= stated.sats);

		if (!issuance) {
			if (stated?.exact) {
				const asset = resolveAsset(input.asset, `input ${id}`, { policyAsset, scope });
				const funding = candidatesIn(asset).find(
					(utxo) => !taken.has(outpointKey(utxo)) && fits(utxo),
				);

				if (!funding) {
					throw new Refusal(
						`Input ${id} spends one output of this wallet holding exactly ${stated.sats} of ` +
							`${asset}, and there is none left to use.`,
						"shortfall",
					);
				}

				taken.add(outpointKey(funding));
				reserved.push({ asset, inputId: id, utxo: funding });
			}

			continue;
		}

		const reissues = issuance.kind === "reissue";
		const program = context.programInputs.find((candidate) => candidate.id === id);

		const asset = reissues
			? reissuedToken(input, issuance, { policyAsset, scope })
			: resolveAsset(input.asset, `input ${id}`, {
					policyAsset: context.policyAsset,
					scope: scope,
				});

		if (program) {
			const outpoint = { txid: program.txid, vout: program.vout };
			const key = outpointKey(outpoint);

			if (
				reissues &&
				(program.blindingSecretsJson === undefined || scope.inputs[id]?.asset !== asset)
			) {
				throw new Refusal(
					`Input ${id} reissues an asset, which needs the program it spends to hold that ` +
						`asset's reissuance token ${asset} blinded, and the program holds something else.`,
				);
			}

			if (taken.has(key)) {
				throw new Refusal(
					`Input ${id} issues an asset from ${outpoint.txid}:${outpoint.vout}, which ` +
						"another input of this transaction already issues from. One output cannot " +
						"create two assets.",
				);
			}

			const issuedHere = issuanceIdentity({ declared: issuance, id, outpoint }, scope);

			taken.add(key);
			identities.push({ declared: issuance, planned: issuedHere });
			scope = scope.withInput(id, issuanceAttributes(issuedHere));

			continue;
		}

		const funding = candidatesIn(asset).find(
			(utxo) =>
				!taken.has(outpointKey(utxo)) && (!reissues || utxo.confidential === true) && fits(utxo),
		);

		if (!funding) {
			throw new Refusal(
				reissues
					? `Input ${id} reissues an asset, which needs a blinded output of this wallet ` +
							`holding its reissuance token ${asset}, and there is none left to use.`
					: `Input ${id} issues an asset, which needs one of this wallet's own outputs in ` +
							`${asset} to derive it from, and there is none left to use.`,
				"shortfall",
			);
		}

		const resolved = issuanceIdentity(
			{ declared: issuance, id, outpoint: { txid: funding.txid, vout: funding.vout } },
			scope,
		);

		taken.add(outpointKey(funding));
		reserved.push({ asset, inputId: id, utxo: funding });
		identities.push({ declared: issuance, planned: resolved });
		scope = scope.withInput(id, issuanceAttributes(resolved));
	}

	return { identities, reserved, scope };
}

type WalletAmount = { exact: boolean; sats: bigint };

function walletAmount(input: Input, scope: Scope): WalletAmount | undefined {
	const declared = input.amount_sat;

	if (declared === undefined) {
		return undefined;
	}

	const exact = typeof declared !== "object";
	const sats = Refusal.amend(
		() => resolveAmount(exact ? declared : declared.min_amount, scope),
		(reason) => `Input ${input.label} states an amount this wallet cannot work out: ${reason}`,
	);

	return { exact, sats };
}

function reissuedToken(
	input: Input,
	issuance: Issuance,
	context: { policyAsset: string; scope: Scope },
): string {
	const id = input.label;
	const token = reissuanceOf(issuance, id, context.scope).reissuanceToken;
	const spent = resolveAsset(input.asset, `input ${id}`, context);

	if (spent !== token) {
		throw new Refusal(
			`Input ${id} reissues an asset whose reissuance token is ${token}, and declares that ` +
				`it spends ${spent}. A reissuing input spends its token.`,
		);
	}

	return token;
}

function bySize(left: bigint, right: bigint, smallestFirst: boolean): number {
	if (left === right) {
		return 0;
	}

	return left > right === smallestFirst ? 1 : -1;
}

function runActionHooks(action: Action, scope: Scope): Scope {
	let running = scope;

	for (const input of action.inputs) {
		if (input.on_resolved !== undefined) {
			running = withHookValues(
				running,
				runHook(
					input.on_resolved.set,
					inputHookScope(running, running.inputs?.[input.label] ?? {}),
				),
			);
		}
	}

	return action.on_pre_broadcast === undefined
		? running
		: withHookValues(running, runHook(action.on_pre_broadcast.set, running));
}

function withoutDeployedFields(
	action: Action,
	supplied: Record<string, unknown>,
	fields: Record<string, unknown>,
): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(supplied).filter(([name]) => name in action.params || !(name in fields)),
	);
}

function exactAmount(input: ProgramInput): string | number | undefined {
	if (typeof input.amount_sat === "object") {
		throw new Refusal(
			`Input ${input.label} spends a program output, whose amount is stated exactly rather ` +
				"than as a minimum.",
		);
	}

	return input.amount_sat;
}

function walletScript(hex: string): Uint8Array {
	const script = decodeHex(hex);

	if (!script) {
		throw new TypeError(`The wallet's script ${hex} is not hex.`);
	}

	return script;
}

function sameScript(one: string, other: string): boolean {
	return one.trim().toLowerCase() === other.trim().toLowerCase();
}
