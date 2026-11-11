import { baseUnits } from "../chain/baseUnits";
import type { Outpoint } from "../chain/outpoint";
import { byOutpoint, outpointKey } from "../chain/outpoint";
import { confirmationModel, type ReviewedPlan } from "../confirmation";
import { asArray, asRecord } from "../document/json";
import { type Action, type InstanceFile, Manifest, readInstance } from "../document/manifest";
import type { ReferenceScope } from "../document/references";
import { refuseUnsupported } from "../document/refuse";
import { type ProgramSite, programSites } from "../document/sites";
import {
	type AssetLedger,
	assetLedger,
	type HeldValue,
	resolveAsset,
} from "../evaluation/assetLedger";
import { type BlindingDecision, resolveChangeBlinding } from "../evaluation/blinding";
import {
	actionHook,
	inputHook,
	inputHookScope,
	runHook,
	withHookValues,
} from "../evaluation/hooks";
import { type InputPlacement, type PlaceableInput, placeInputs } from "../evaluation/inputOrder";
import {
	checkRelativeTimelockPlacement,
	type InputRule,
	resolveInputRules,
	transactionSequence,
} from "../evaluation/inputRules";
import {
	declaredIssuance,
	issuanceAttributes,
	type PlannedIssuance,
	resolveIssuance,
} from "../evaluation/issuance";
import { fillParameters } from "../evaluation/parameters";
import { type PlannedSpend, planAction } from "../evaluation/plan";
import { checkPositions, type StatedPosition } from "../evaluation/positions";
import { resolveStaticWitnesses } from "../evaluation/witness";
import { declaredParamTypes } from "../programs/declaredTypes";
import {
	type CreatedInstance,
	createsInstance,
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
import { resolveActionRequirements } from "../request/requirements";
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
	readonly #deployment: InstanceFile;
	readonly #action: Action;
	readonly #includeDebugSymbols: boolean;
	readonly #declaredTypes: Record<string, string>;
	readonly #policyAsset: string;
	readonly #mayReturn: (asset: string) => boolean;
	readonly #pools = new Map<string, SelectableUtxo[]>();
	readonly #inputs: Record<string, Record<string, unknown>> = {};
	readonly #chainHeld: HeldValue[] = [];
	readonly #programs: ProgramFinding[] = [];
	readonly #programInputs: ReviewedProgramInput[] = [];
	#scope: ReferenceScope;

	private constructor(request: ParsedLiquidProcessCtParams, input: ReviewInput) {
		this.#request = request;
		this.#input = input;
		this.#manifest = new Manifest(request.manifest);
		this.#deployment = readInstance(request.instance);
		this.#policyAsset = input.policyAsset.trim().toLowerCase();

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

		const allowed = allowChange(action);

		this.#mayReturn = (asset) =>
			allowed === "any" || (allowed === "lbtc_only" && asset === this.#policyAsset);
		this.#includeDebugSymbols = this.#manifest.includeDebugSymbols;

		const fields = this.#deployment.fields;
		const supplied = withoutDeployedFields(action, request.params, fields);
		const params = fillParameters(action, supplied, { instance: fields, params: supplied });
		const malformed = malformedDeclaration(action);

		if (malformed) {
			throw new Refusal(malformed);
		}

		const { missing } = resolveActionRequirements({ ...request, params }, this.#manifest, action);

		if (missing.length > 0) {
			const named = missing
				.map((entry) => (entry.keys ? `${entry.reason} (${entry.keys.join(", ")})` : entry.reason))
				.join(" ");

			throw new Refusal(`This request cannot be built. ${named}`, "incomplete-request");
		}

		const stated = createsInstance(action)
			? statedCreatedFields(action, { instance: fields, params })
			: {};

		this.#declaredTypes = declaredParamTypes(this.#manifest, action);
		this.#scope = { inputs: this.#inputs, instance: { ...fields, ...stated }, params };
	}

	static run(request: ParsedLiquidProcessCtParams, input: ReviewInput): Promise<ManifestReview> {
		return new ActionReview(request, input).#run();
	}

	async #run(): Promise<ManifestReview> {
		await this.#spendPrograms();

		const issued = resolveIssuances(this.#action, {
			programInputs: this.#programInputs,
			holdings: (asset) => this.#holdings(asset),
			inputs: this.#inputs,
			policyAsset: this.#input.policyAsset,
			scope: this.#scope,
		});

		this.#scope = runActionHooks(this.#action, this.#scope);

		const created = this.#createInstance();

		await this.#createPrograms();
		this.#attachWitnessValues();

		this.#scope = { ...this.#scope, fee: MIN_FEE_SATS };
		planAction(this.#action, this.#scope);

		const rules = resolveInputRules(this.#action, this.#scope);
		const sequence = transactionSequence(rules);
		const feeRateSatsPerKvb = await this.#feeRate();
		const locktimeHeight =
			this.#programInputs.length > 0 && this.#input.readChainTip
				? await this.#input.readChainTip().catch(() => undefined)
				: undefined;
		const timing = {
			...(locktimeHeight === undefined ? {} : { locktimeHeight }),
			...(sequence === undefined ? {} : { sequence }),
		};
		let settled = await this.#settle(issued, rules, timing, feeRateSatsPerKvb);

		for (let round = 1; settled.feeSats > (this.#scope.fee ?? 0n); round += 1) {
			if (round === FEE_ROUNDS) {
				throw new Refusal(
					`The fee for "${this.#request.action}" kept rising as this wallet funded the ` +
						"action, so the wallet cannot say what the transaction costs.",
					"built-something-else",
				);
			}

			this.#scope = { ...this.#scope, fee: settled.feeSats };
			// oxlint-disable-next-line no-await-in-loop
			settled = await this.#settle(issued, rules, timing, feeRateSatsPerKvb);
		}

		const { draft, ledger, paid, placed } = settled;
		const estimatedFeeSats = (this.#scope.fee ?? 0n) + paid.droppedSats;

		const reviewed: ReviewedPlan = {
			...draft,
			...(this.#action.boundTo === undefined ? {} : { boundTo: this.#action.boundTo }),
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
		timing: Pick<TransactionDraft, "locktimeHeight" | "sequence">,
		feeRateSatsPerKvb: number,
	) {
		const plan = planAction(this.#action, this.#scope);
		const ledger = this.#ledger(plan, issued);

		this.#refuseHiddenPayments(plan);

		const funded = this.#fund(ledger, rules, issued);
		const paid = this.#payOutputs(plan, ledger, funded);
		const placed = this.#placeInputs(ledger, funded, rules, timing.sequence);

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

	#sites(role: ProgramSite["role"]): ProgramSite[] {
		return programSites(this.#action.node).filter((site) => site.role === role);
	}

	#derive(site: ProgramSite): Promise<ProgramDerivation> {
		return deriveProgramAddress(this.#manifest, {
			compile: this.#input.compile,
			...(this.#input.programParamTypes === undefined
				? {}
				: { programParamTypes: this.#input.programParamTypes }),
			contractSources: this.#request.contractSources,
			declaredTypes: this.#declaredTypes,
			includeDebugSymbols: this.#includeDebugSymbols,
			network: this.#input.network,
			scope: this.#scope,
			utxoType: site.utxoType,
			wiring: site.wiring,
		});
	}

	async #spendPrograms(): Promise<void> {
		const utxos = new ProgramUtxos(this.#request.state, this.#deployment.providedInputs);

		for (const site of this.#sites("spent")) {
			// oxlint-disable-next-line no-await-in-loop
			const derived = await this.#derive(site);
			const asset = Refusal.attempt(() =>
				resolveAsset(site.asset, `input ${site.id}`, {
					policyAsset: this.#input.policyAsset,
					scope: this.#scope,
				}),
			);
			const outpoint = utxos.claim(site.id, site.utxoType, asset);
			// oxlint-disable-next-line no-await-in-loop
			const onChain = await this.#readTxOut(outpoint);

			checkProgramOnChain(derived, onChain.scriptPubKeyHex);

			if (onChain.amountSats === undefined || onChain.rawAssetId === undefined) {
				throw new Refusal(
					`The ${site.utxoType} at ${outpoint.txid}:${outpoint.vout} did not come back with an ` +
						"explicit amount and asset, so this wallet cannot say what it holds. It will not " +
						"assume a balance for an output it is about to spend.",
					"unbuildable-utxo-type",
				);
			}

			if (!site.id) {
				throw new Refusal(
					`The ${site.utxoType} this action spends holds ${onChain.amountSats} of ` +
						`${onChain.rawAssetId}, and the manifest gives that input no id, so this wallet ` +
						"cannot account for what it brings.",
				);
			}

			const held = baseUnits(onChain.amountSats);

			if (held === undefined) {
				throw new Refusal(
					`The ${site.utxoType} at ${outpoint.txid}:${outpoint.vout} came back holding ` +
						`${JSON.stringify(onChain.amountSats)}, which is not an amount this wallet can read. ` +
						"It will not spend an output it cannot say the value of.",
					"unbuildable-utxo-type",
				);
			}

			this.#inputs[site.id] = { amount_sat: held, asset: onChain.rawAssetId };
			this.#chainHeld.push({ asset: onChain.rawAssetId, id: site.id, sats: held });
			this.#programInputs.push({
				argumentsJson: derived.argumentsJson,
				extraLeavesJson: derived.extraLeavesJson,
				id: site.id,
				includeDebugSymbols: derived.includeDebugSymbols,
				...(site.signatureWitness === undefined ? {} : { signatureWitness: site.signatureWitness }),
				source: derived.source,
				txOutHex: onChain.txOutHex,
				txid: outpoint.txid,
				utxoType: site.utxoType,
				vout: outpoint.vout,
			});
			this.#programs.push({ ...derived, role: "spent", verified: "matches-chain" });
		}
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
		if (!createsInstance(this.#action)) {
			return undefined;
		}

		const created = resolveCreatedInstance(this.#action, {
			contractSources: this.#request.contractSources,
			hashProgram: programHashFrom(this.#input.scriptPubKeyOf, this.#includeDebugSymbols),
			scope: this.#scope,
		});

		this.#scope = { ...this.#scope, instance: { ...this.#scope.instance, ...created.fields } };

		return created;
	}

	async #createPrograms(): Promise<void> {
		for (const site of this.#sites("created")) {
			// oxlint-disable-next-line no-await-in-loop
			const derived = await this.#derive(site);

			this.#programs.push({ ...derived, role: "created", verified: "not-yet-onchain" });
		}
	}

	#attachWitnessValues(): void {
		const stated = resolveStaticWitnesses(this.#action, this.#scope);

		for (const program of this.#programInputs) {
			const values = stated.get(program.id);

			if (values && values.length > 0) {
				program.witnessValues = values;
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
				...issued.issuances.map((issuance) => ({
					asset: issuance.asset,
					created: true as const,
					id: issuance.inputId,
					sats: issuance.assetAmountSats,
				})),
			],
			policyAsset: this.#input.policyAsset,
			scope: this.#scope,
		});
	}

	#refuseHiddenPayments(plan: PlannedSpend): void {
		const foreign = plan.outputs.find(
			(planned) =>
				planned.blinding.blinding === "blinded" &&
				planned.target.kind !== "change" &&
				planned.target.kind !== "wallet",
		);

		if (foreign) {
			throw new Refusal(
				`The output ${foreign.id || "(unnamed)"} must hide what it carries and pays somewhere ` +
					"this wallet holds no blinding key for.",
				"unimplemented-construct",
			);
		}
	}

	#fund(ledger: AssetLedger, rules: InputRule[], issued: ResolvedIssuances): FundedAsset[] {
		const pinFor = new Map<string, string>();

		for (const rule of rules) {
			if (rule.fromAddress !== undefined) {
				pinFor.set(rule.id, rule.fromAddress);
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
			holdings: pinnedHoldings,
			mayReturn: this.#mayReturn,
			policyAsset: this.#input.policyAsset,
			reserved: issued.reserved,
		});
	}

	#payOutputs(plan: PlannedSpend, ledger: AssetLedger, funded: FundedAsset[]): PaidOutputs {
		const changeFor = new Map(funded.map((entry) => [entry.asset, entry.changeSats]));
		const spendsConfidential = funded.some((entry) =>
			entry.selected.some((utxo) => utxo.confidential === true),
		);
		const programScripts = new Map(
			this.#programs.map((found) => [found.utxoType, found.scriptPubKeyHex]),
		);
		const paid: PaidOutputs = {
			at: new Map(),
			droppedSats: 0n,
			outputs: [],
			returned: new Map(),
		};

		const payChange = (asset: string, id: string, planned: BlindingDecision) => {
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

			paid.at.set(id, paid.outputs.length);
			paid.outputs.push({
				asset,
				blinded: blinding.blinding === "blinded",
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
				payChange(asset, planned.id, planned.blinding);

				continue;
			}

			if (planned.sats === undefined) {
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

			paid.at.set(planned.id, paid.outputs.length);
			paid.outputs.push({
				asset,
				blinded: planned.blinding.blinding === "blinded",
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
		sequence: number | undefined,
	): PlacedInputs {
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
			const credited = creditedWith.get(wallet.asset);

			if (credited !== undefined) {
				fundedWith.set(wallet.id, credited);

				continue;
			}

			creditedWith.set(wallet.asset, wallet.id);
			walletRuns.set(
				wallet.id,
				(fundedFor.get(wallet.asset)?.selected ?? []).map((utxo) => ({
					source: "wallet" as const,
					utxo,
				})),
			);
		}

		const placeable: PlaceableInput<PlannedInput>[] = [];

		for (const declared of asArray(this.#action.node.inputs).map((entry) => asRecord(entry))) {
			if (!declared) {
				continue;
			}

			const id = typeof declared.id === "string" ? declared.id : "(unnamed)";
			const program = this.#programInputs.find((candidate) => candidate.id === id);
			const wanted = statedIndex(declared.required_index);

			placeable.push({
				id,
				slots: program ? [{ program, source: "program" }] : (walletRuns.get(id) ?? []),
				...(wanted === undefined ? {} : { stated: wanted }),
			});
		}

		const undeclared = fundedOrder
			.filter((asset) => !creditedWith.has(asset))
			.flatMap((asset) => fundedFor.get(asset)?.selected ?? []);

		if (undeclared.length > 0) {
			placeable.push({ slots: undeclared.map((utxo) => ({ source: "wallet" as const, utxo })) });
		}

		const placement = placeInputs(placeable);

		checkRelativeTimelockPlacement(
			sequence,
			rules,
			placement.order.map((planned) =>
				planned.source === "program" ? { declaredBy: planned.program.id } : {},
			),
		);

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

		for (const entry of asArray(this.#action.node.inputs)) {
			const declared = asRecord(entry);

			if (!declared || declared.required_index === undefined) {
				continue;
			}

			const id = typeof declared.id === "string" ? declared.id : "(unnamed)";
			const wanted = statedIndex(declared.required_index);

			if (wanted === undefined) {
				throw new Refusal(
					`Input ${id} states a position of ${JSON.stringify(declared.required_index)}, which is not a place in a transaction.`,
					"unbuildable-position",
				);
			}

			positions.push({
				at: placed.landedAt(id) ?? placed.placement.order.length,
				id,
				kind: "input",
				stated: wanted,
			});
		}

		for (const entry of asArray(this.#action.node.outputs)) {
			const declared = asRecord(entry);

			if (!declared || declared.required_index === undefined) {
				continue;
			}

			const id = typeof declared.id === "string" ? declared.id : undefined;
			const wanted = statedIndex(declared.required_index);

			if (wanted === undefined) {
				throw new Refusal(
					`Output ${id ?? "(unnamed)"} states a position of ${JSON.stringify(declared.required_index)}, which is not a place in a transaction.`,
					"unbuildable-position",
				);
			}

			if (id === undefined) {
				throw new Refusal(
					`This action states a position for an output the manifest gives no id, so this ` +
						"wallet cannot say which output it is or where it landed.",
					"unbuildable-position",
				);
			}

			positions.push({
				at: paid.at.get(id) ?? paid.outputs.length,
				id,
				kind: "output",
				stated: wanted,
			});
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

const UNDECLARED_CHANGE: BlindingDecision = {
	blinding: "open",
	decidedBy: "spendable-change",
	overrode: "chain",
};

const ALLOW_CHANGE = ["none", "lbtc_only", "any"];

function allowChange(action: Action): string {
	const declared = action.node.allow_change ?? "none";

	if (typeof declared !== "string" || !ALLOW_CHANGE.includes(declared)) {
		throw new Refusal(
			`${action.name} sets allow_change to ${JSON.stringify(declared)}, and the format ` +
				'allows only "none", "lbtc_only" or "any".',
		);
	}

	return declared;
}

type ResolvedIssuances = {
	issuances: PlannedIssuance[];
	reserved: { asset: string; inputId: string; utxo: SelectableUtxo }[];
};

function resolveIssuances(
	action: Action,
	context: {
		programInputs: ReviewedProgramInput[];
		holdings: AssetHoldings;
		inputs: Record<string, Record<string, unknown>>;
		policyAsset: string;
		scope: ReferenceScope;
	},
): ResolvedIssuances {
	const issuances: PlannedIssuance[] = [];
	const reserved: { asset: string; inputId: string; utxo: SelectableUtxo }[] = [];
	const policyAsset = context.policyAsset.trim().toLowerCase();
	const pools = new Map<string, SelectableUtxo[]>();
	const taken = new Set<string>();

	const candidatesIn = (asset: string): SelectableUtxo[] => {
		const existing = pools.get(asset);

		if (existing) {
			return existing;
		}

		const ordered = byOutpoint(context.holdings(asset).filter((utxo) => utxo.spendable)).toSorted(
			(one, other) => bySize(toSats(one.amount), toSats(other.amount), asset === policyAsset),
		);

		pools.set(asset, ordered);

		return ordered;
	};

	const spareIn = (asset: string): SelectableUtxo | undefined =>
		candidatesIn(asset).find((utxo) => !taken.has(outpointKey(utxo)));

	for (const entry of asArray(action.node.inputs)) {
		const declared = asRecord(entry);
		const issuance = declared && declaredIssuance(declared);

		if (!declared || !issuance) {
			continue;
		}

		const id = typeof declared.id === "string" ? declared.id : "(unnamed)";

		const asset = resolveAsset(declared.asset, `input ${id}`, {
			policyAsset: context.policyAsset,
			scope: context.scope,
		});

		const program = context.programInputs.find((candidate) => candidate.id === id);

		if (program) {
			const outpoint = { txid: program.txid, vout: program.vout };
			const key = outpointKey(outpoint);

			if (taken.has(key)) {
				throw new Refusal(
					`Input ${id} issues an asset from ${outpoint.txid}:${outpoint.vout}, which ` +
						"another input of this transaction already issues from. One output cannot " +
						"create two assets.",
				);
			}

			const issuedHere = resolveIssuance({ declared: issuance, id, outpoint }, context.scope);

			taken.add(key);
			issuances.push(issuedHere);
			context.inputs[id] = { ...context.inputs[id], ...issuanceAttributes(issuedHere) };

			continue;
		}

		const funding = spareIn(asset);

		if (!funding) {
			throw new Refusal(
				`Input ${id} issues an asset, which needs one of this wallet's own outputs in ` +
					`${asset} to derive it from, and there is none left to use.`,
				"shortfall",
			);
		}

		const resolved = resolveIssuance(
			{ declared: issuance, id, outpoint: { txid: funding.txid, vout: funding.vout } },
			context.scope,
		);

		taken.add(outpointKey(funding));
		reserved.push({ asset, inputId: id, utxo: funding });
		issuances.push(resolved);
		context.inputs[id] = { ...context.inputs[id], ...issuanceAttributes(resolved) };
	}

	return { issuances, reserved };
}

function bySize(left: bigint, right: bigint, smallestFirst: boolean): number {
	if (left === right) {
		return 0;
	}

	return left > right === smallestFirst ? 1 : -1;
}

function runActionHooks(action: Action, scope: ReferenceScope): ReferenceScope {
	let running = scope;

	for (const entry of asArray(action.node.inputs)) {
		const declared = asRecord(entry);

		if (!declared) {
			continue;
		}

		const id = typeof declared.id === "string" ? declared.id : "(unnamed)";
		const hook = inputHook(declared);

		if (hook.kind === "malformed") {
			throw new Refusal(`Input ${id}: ${hook.reason}`);
		}

		if (hook.kind === "absent") {
			continue;
		}

		running = withHookValues(
			running,
			runHook(hook.set, inputHookScope(running, running.inputs?.[id] ?? {})),
		);
	}

	const hook = actionHook(action);

	if (hook.kind === "malformed") {
		throw new Refusal(`${action.name}: ${hook.reason}`);
	}

	return hook.kind === "absent" ? running : withHookValues(running, runHook(hook.set, running));
}

function withoutDeployedFields(
	action: Action,
	supplied: Record<string, unknown>,
	fields: Record<string, unknown>,
): Record<string, unknown> {
	const declared = asRecord(action.node.params) ?? {};

	return Object.fromEntries(
		Object.entries(supplied).filter(([name]) => name in declared || !(name in fields)),
	);
}

function sameScript(one: string, other: string): boolean {
	return one.trim().toLowerCase() === other.trim().toLowerCase();
}

function statedIndex(declared: unknown): number | undefined {
	return typeof declared === "number" && Number.isSafeInteger(declared) ? declared : undefined;
}

function malformedDeclaration(action: Action): string | undefined {
	const node = action.node;

	for (const key of ["inputs", "outputs"] as const) {
		if (node[key] !== undefined && !Array.isArray(node[key])) {
			return `${action.name} declares ${key} as something other than a list, so this wallet cannot read what it declares.`;
		}

		for (const [at, entry] of asArray(node[key]).entries()) {
			if (!asRecord(entry)) {
				return `${action.name} declares ${key} ${at} as something this wallet cannot read.`;
			}
		}
	}

	if (node.params !== undefined && !asRecord(node.params)) {
		return `${action.name} declares params as something other than a set of parameters, so this wallet cannot fill any of them.`;
	}

	for (const entry of asArray(node.inputs)) {
		const input = asRecord(entry) ?? {};
		const id = typeof input.id === "string" ? input.id : "(unnamed)";

		if (input.witnesses !== undefined && !asRecord(input.witnesses)) {
			return `Input ${id} declares witnesses this wallet cannot read.`;
		}

		if (input.issuance !== undefined && !asRecord(input.issuance)) {
			return `Input ${id} declares an issuance this wallet cannot read.`;
		}
	}

	return undefined;
}
