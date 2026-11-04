import { baseUnits } from "../chain/baseUnits";
import type { ReadChainTip, ReadFeeRate, ReadTxOut } from "../chain/chainRead";
import { byOutpoint, outpointKey } from "../chain/outpoint";
import { type ConfirmationModel, confirmationModel, type ReviewedPlan } from "../confirmation";
import {
	type CompileCovenant,
	type CovenantParamTypesOf,
	type CovenantDerivation,
	checkCovenantOnChain,
	deriveCovenantAddress,
} from "../covenants/covenant";
import { type CompileScriptPubKey, covenantHashFrom } from "../covenants/covenantHash";
import { declaredParamTypes } from "../covenants/declaredTypes";
import {
	type CreatedInstance,
	createsInstance,
	resolveCreatedInstance,
	statedCreatedFields,
} from "../covenants/instance";
import { asArray, asRecord } from "../document/json";
import {
	findAction,
	type NormalisedAction,
	normaliseInstance,
	normaliseManifest,
} from "../document/normalise";
import type { ReferenceScope } from "../document/references";
import { refuseUnsupported } from "../document/refuse";
import { covenantSites } from "../document/sites";
import { assetLedger, type HeldValue, resolveAsset } from "../evaluation/assetLedger";
import {
	type BlindingDecision,
	type BlindingWord,
	resolveChangeBlinding,
} from "../evaluation/blinding";
import {
	actionHook,
	inputHook,
	inputHookScope,
	runHook,
	withHookValues,
} from "../evaluation/hooks";
import { type PlaceableInput, placeInputs } from "../evaluation/inputOrder";
import {
	checkRelativeTimelockPlacement,
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
import { planAction } from "../evaluation/plan";
import { checkPositions, type StatedPosition } from "../evaluation/positions";
import { resolveStaticWitnesses, type StaticWitness } from "../evaluation/witness";
import { estimateFeeSats } from "../fee";
import { type RejectToken, Refusal } from "../refusal";
import type { ParsedLiquidProcessCtParams } from "../request/request";
import { resolveActionRequirements } from "../request/requirements";
import { type AssetHoldings, fundAssets } from "./assetFunding";
import { type SelectableUtxo, toSats } from "./coinSelection";
import { CovenantUtxos } from "./covenantUtxos";

export type CovenantFinding = CovenantDerivation & {
	role: "created" | "spent";
	verified: "matches-chain" | "not-yet-onchain";
};

export type ReviewedCovenantInput = {
	argumentsJson: string;
	extraLeavesJson: string;
	id: string;
	includeDebugSymbols: boolean;
	signatureWitness?: string;
	source: string;
	txOutHex: string;
	txid: string;
	utxoType: string;
	vout: number;
	witnessValues?: StaticWitness[];
};

export type PlannedInput =
	| { covenant: ReviewedCovenantInput; source: "covenant" }
	| { source: "wallet"; utxo: SelectableUtxo };

export type ReviewedOutput = {
	asset: string;
	blinded: boolean;
	decidedBy: BlindingWord;
	id: string;
	overrode?: BlindingWord;
	sats: bigint;
	scriptPubKeyHex: string;
};

export type AssetMovement = {
	asset: string;
	sats: bigint;
};

export type ManifestReview = {
	action: string;
	changeBlinded: boolean;
	changeDeferred?: boolean;
	changeBlindedBy?: BlindingWord;
	changeOverrode?: BlindingWord;
	boundTo?: string;
	confirmation: ConfirmationModel;
	covenants: CovenantFinding[];
	covenantInputs: ReviewedCovenantInput[];
	createdInstance?: CreatedInstance;
	estimatedFeeSats: bigint;
	feeRateSatsPerKvb: number;
	issuances: PlannedIssuance[];
	inputOrder: PlannedInput[];
	locktimeHeight?: number;
	sequence?: number;
	movements: AssetMovement[];
	outputs: ReviewedOutput[];
	policyAsset: string;
	protocol: string;
	selected: SelectableUtxo[];
};

export type ReviewRefusal = { reason: string; refused: true; reject: RejectToken };

export type ReviewManifestActionResult = ManifestReview | ReviewRefusal;

export function isRefusal(result: ReviewManifestActionResult): result is ReviewRefusal {
	return "refused" in result;
}

type ReviewInput = {
	accountLabel: string;
	compile: CompileCovenant;
	compilerVersion?: string;
	covenantParamTypes?: CovenantParamTypesOf;
	fundingUtxos: SelectableUtxo[];
	holdingsOf?: AssetHoldings;
	network: string;
	policyAsset: string;
	readChainTip?: ReadChainTip;
	readFeeRate: ReadFeeRate;
	readTxOut: ReadTxOut;
	scriptPubKeyOf: CompileScriptPubKey;
	walletScriptPubKeyHex: string;
};

export async function reviewManifestAction(
	request: ParsedLiquidProcessCtParams,
	input: ReviewInput,
): Promise<ReviewManifestActionResult> {
	try {
		return await reviewAction(request, input);
	} catch (error) {
		if (error instanceof Refusal) {
			return { reason: error.reason, refused: true, reject: error.reject };
		}

		throw error;
	}
}

async function reviewAction(
	request: ParsedLiquidProcessCtParams,
	input: ReviewInput,
): Promise<ManifestReview> {
	const manifest = normaliseManifest(request.manifest);
	const deployment = normaliseInstance(request.instance);

	const unsupported = refuseUnsupported(manifest, {
		...(input.compilerVersion === undefined ? {} : { compilerVersion: input.compilerVersion }),
		contractSources: request.contractSources,
	});

	if (unsupported) {
		throw unsupported;
	}

	const action = findAction(manifest, request.action);

	if (!action) {
		throw new Refusal(
			`The manifest declares no action named "${request.action}".`,
			"no-such-action",
		);
	}

	const buildMode = manifest.buildMode;

	if (!buildMode.ok) {
		throw new Refusal(buildMode.reason, "unreadable-build-mode");
	}

	const params = fillParameters(action, request.params, {
		instance: deployment.fields,
		params: request.params,
	});
	const malformed = malformedDeclaration(action);

	if (malformed) {
		throw new Refusal(malformed);
	}

	const requirements = resolveActionRequirements({ ...request, params }, manifest, action);

	if (requirements.missing.length > 0) {
		const named = requirements.missing
			.map((entry) => (entry.keys ? `${entry.reason} (${entry.keys.join(", ")})` : entry.reason))
			.join(" ");

		throw new Refusal(`This request cannot be built. ${named}`, "incomplete-request");
	}

	const pools = new Map<string, SelectableUtxo[]>();
	const holdings: AssetHoldings = (asset) => {
		const existing = pools.get(asset);

		if (existing) {
			return existing;
		}

		const pool =
			asset === input.policyAsset.trim().toLowerCase()
				? input.fundingUtxos
				: (input.holdingsOf?.(asset) ?? []);

		pools.set(asset, pool);

		return pool;
	};

	const declaredTypes = declaredParamTypes(manifest, action);
	const hashCovenant = covenantHashFrom(input.scriptPubKeyOf, buildMode.includeDebugSymbols);
	const covenants: CovenantFinding[] = [];
	const covenantInputs: ReviewedCovenantInput[] = [];

	const inputs: Record<string, Record<string, unknown>> = {};
	const chainHeld: HeldValue[] = [];
	const statedFields = createsInstance(action)
		? statedCreatedFields(action, { instance: deployment.fields, params })
		: {};
	let scope: ReferenceScope = {
		inputs,
		instance: { ...deployment.fields, ...statedFields },
		params,
	};

	const utxos = new CovenantUtxos(request.state, deployment.providedInputs);

	for (const site of covenantSites(action.node).filter((declared) => declared.role === "spent")) {
		// oxlint-disable-next-line no-await-in-loop
		const derived = await deriveCovenantAddress(manifest, {
			compile: input.compile,
			...(input.covenantParamTypes === undefined
				? {}
				: { covenantParamTypes: input.covenantParamTypes }),
			contractSources: request.contractSources,
			declaredTypes,
			includeDebugSymbols: buildMode.includeDebugSymbols,
			network: input.network,
			scope,
			utxoType: site.utxoType,
			wiring: site.wiring,
		});

		const asset = Refusal.attempt(() =>
			resolveAsset(site.asset, `input ${site.id}`, { policyAsset: input.policyAsset, scope }),
		);
		const outpoint = utxos.claim(site.id, site.utxoType, asset);

		let onChain;

		try {
			// oxlint-disable-next-line no-await-in-loop
			onChain = await input.readTxOut(outpoint);
		} catch (error) {
			throw new Refusal(
				`Could not read what is at ${outpoint.txid}:${outpoint.vout}: ${String(error)}`,
				"chain-read-failed",
			);
		}

		checkCovenantOnChain(derived, onChain.scriptPubKeyHex);

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
				"document-fault",
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

		inputs[site.id] = { amount_sat: held, asset: onChain.rawAssetId };
		chainHeld.push({ asset: onChain.rawAssetId, id: site.id, sats: held });

		covenantInputs.push({
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
		covenants.push({ ...derived, role: "spent", verified: "matches-chain" });
	}

	const issued = resolveIssuances(action, {
		covenantInputs,
		holdings,
		inputs,
		policyAsset: input.policyAsset,
		scope,
	});

	scope = runActionHooks(action, scope);

	const created = createsInstance(action)
		? resolveCreatedInstance(action, {
				contractSources: request.contractSources,
				hashCovenant,
				scope,
			})
		: undefined;

	if (created) {
		scope = { ...scope, instance: { ...scope.instance, ...created.fields } };
	}

	for (const site of covenantSites(action.node).filter((declared) => declared.role === "created")) {
		// oxlint-disable-next-line no-await-in-loop
		const derived = await deriveCovenantAddress(manifest, {
			compile: input.compile,
			...(input.covenantParamTypes === undefined
				? {}
				: { covenantParamTypes: input.covenantParamTypes }),
			contractSources: request.contractSources,
			declaredTypes,
			includeDebugSymbols: buildMode.includeDebugSymbols,
			network: input.network,
			scope,
			utxoType: site.utxoType,
			wiring: site.wiring,
		});

		covenants.push({ ...derived, role: "created", verified: "not-yet-onchain" });
	}

	const stated = resolveStaticWitnesses(action, scope);

	for (const covenant of covenantInputs) {
		const values = stated.get(covenant.id);

		if (values && values.length > 0) {
			covenant.witnessValues = values;
		}
	}

	const plan = planAction(action, scope);

	const inputRules = resolveInputRules(action, scope);
	const sequence = transactionSequence(inputRules);

	let feeRateSatsPerKvb: number;

	try {
		feeRateSatsPerKvb = await input.readFeeRate(FEE_TARGET_BLOCKS);
	} catch (error) {
		throw new Refusal(
			`The wallet could not establish a fee rate, so it will not build this: ${String(error)}`,
			"no-fee-rate",
		);
	}

	if (!Number.isFinite(feeRateSatsPerKvb) || feeRateSatsPerKvb < 0) {
		throw new Refusal(
			`The wallet was given ${feeRateSatsPerKvb} as a fee rate, which is not a rate anything ` +
				"can be charged at. It will not build a transaction it cannot price.",
			"no-fee-rate",
		);
	}

	const ledger = assetLedger(action, plan.outputs, {
		held: [
			...chainHeld,
			...issued.issuances.map((issuance) => ({
				asset: issuance.asset,
				created: true as const,
				id: issuance.inputId,
				sats: issuance.assetAmountSats,
			})),
		],
		policyAsset: input.policyAsset,
		scope,
	});

	const policyAsset = input.policyAsset.trim().toLowerCase();

	const networkChange = plan.outputs.filter(
		(planned, at) => planned.target.kind === "change" && ledger.outputs[at] === policyAsset,
	);
	const plannedChange: BlindingDecision = networkChange[0]?.blinding ?? {
		blinding: "open",
		decidedBy: "spendable-change",
		overrode: "chain",
	};

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

	const pinFor = new Map<string, string>();

	for (const rule of inputRules) {
		if (rule.fromAddress !== undefined) {
			pinFor.set(rule.id, rule.fromAddress);
		}
	}

	const fundedInput = new Map(ledger.walletInputs.map((wallet) => [wallet.id, wallet.asset]));

	for (const [id, script] of pinFor) {
		if (!fundedInput.has(id)) {
			throw new Refusal(
				`This action requires input ${id} to be funded from ${script}, and that input is ` +
					"not one this wallet funds out of its own outputs.",
				"document-fault",
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
			? holdings(asset)
			: holdings(asset).filter((utxo) => sameScript(utxo.scriptPubKeyHex ?? "", pin.script));
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

	const funded = fundAssets(ledger.entries, {
		feeSats: feeHeadroomSats(feeRateSatsPerKvb),
		headroomSats: 0n,
		holdings: pinnedHoldings,
		policyAsset: input.policyAsset,
		reserved: issued.reserved,
	});

	const fundedFor = new Map(funded.map((entry) => [entry.asset, entry]));

	const covenantScripts = new Map(
		covenants.map((found) => [found.utxoType, found.scriptPubKeyHex]),
	);
	const outputs: ReviewedOutput[] = [];
	const outputAt = new Map<string, number>();
	const returned = new Map<string, bigint>();
	const changePaid = new Set<string>();
	// Set when a policy-asset "change" output is left out of `outputs` below for the
	// builder's `addChange()` to handle. Without this, an action whose only output is
	// such a change output looks like an action with no outputs at all.
	let changeDeferred = false;

	for (const [at, planned] of plan.outputs.entries()) {
		const asset = ledger.outputs[at] ?? policyAsset;

		if (planned.target.kind === "change") {
			const surplus =
				asset === policyAsset || changePaid.has(asset)
					? 0n
					: (fundedFor.get(asset)?.changeSats ?? 0n);

			if (surplus <= 0n) {
				if (asset === policyAsset) {
					changeDeferred = true;
				}

				continue;
			}

			changePaid.add(asset);
			outputAt.set(planned.id, outputs.length);
			outputs.push({
				asset,
				blinded: planned.blinding.blinding === "blinded",
				decidedBy: planned.blinding.decidedBy,
				id: planned.id,
				...(planned.blinding.overrode === undefined ? {} : { overrode: planned.blinding.overrode }),
				sats: surplus,
				scriptPubKeyHex: input.walletScriptPubKeyHex,
			});

			continue;
		}

		if (planned.sats === undefined) {
			continue;
		}

		const scriptPubKeyHex =
			planned.target.kind === "covenant"
				? covenantScripts.get(planned.target.utxoType)
				: planned.target.kind === "data"
					? planned.target.hex
					: input.walletScriptPubKeyHex;

		if (!scriptPubKeyHex) {
			throw new Refusal(
				`Output ${planned.id} pays a covenant the wallet did not verify.`,
				"covenant-mismatch",
			);
		}

		if (planned.target.kind === "wallet") {
			returned.set(asset, (returned.get(asset) ?? 0n) + planned.sats);
		}

		outputAt.set(planned.id, outputs.length);
		outputs.push({
			asset,
			blinded: planned.blinding.blinding === "blinded",
			decidedBy: planned.blinding.decidedBy,
			id: planned.id,
			sats: planned.sats,
			scriptPubKeyHex,
		});
	}

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

	const declaredInputs = asArray(action.node.inputs).map((entry) => asRecord(entry));
	const placeable: PlaceableInput<PlannedInput>[] = [];

	for (const declared of declaredInputs) {
		if (!declared) {
			continue;
		}

		const id = typeof declared.id === "string" ? declared.id : "(unnamed)";
		const covenant = covenantInputs.find((candidate) => candidate.id === id);
		const slots: PlannedInput[] = covenant
			? [{ covenant, source: "covenant" }]
			: (walletRuns.get(id) ?? []);
		const wanted = statedIndex(declared.required_index);
		const entry: PlaceableInput<PlannedInput> = { id, slots };

		if (wanted !== undefined) {
			entry.stated = wanted;
		}

		placeable.push(entry);
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
		inputRules,
		placement.order.map((planned) =>
			planned.source === "covenant" ? { declaredBy: planned.covenant.id } : {},
		),
	);

	const landedAt = (id: string): number | undefined => {
		const own = placement.at.get(id);

		if (own !== undefined) {
			return own;
		}

		const credited = fundedWith.get(id);
		const start = credited === undefined ? undefined : placement.at.get(credited);

		return start === undefined ? undefined : start + (walletRuns.get(credited ?? "")?.length ?? 0);
	};

	const positions: StatedPosition[] = [];

	for (const declared of declaredInputs) {
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
			at: landedAt(id) ?? placement.order.length,
			id,
			kind: "input",
			stated: wanted,
		});
	}

	for (const entry of asArray(action.node.outputs)) {
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

		positions.push({ at: outputAt.get(id) ?? outputs.length, id, kind: "output", stated: wanted });
	}

	checkPositions(positions, {
		inputs: placement.order.length,
		outputs: outputs.length + Math.min(networkChange.length, 1),
	});

	const selected = fundedOrder.flatMap((asset) => fundedFor.get(asset)?.selected ?? []);
	const change = resolveChangeBlinding(
		plannedChange,
		selected.some((utxo) => utxo.confidential === true),
	);

	const estimatedFeeSats = estimateFeeSats(
		{
			covenantInputs: covenants.filter((found) => found.role === "spent").length,
			issuingInputs: issued.issuances.length,
			outputs: outputs.length,
			walletInputs: selected.length,
		},
		feeRateSatsPerKvb,
	);

	const movements: AssetMovement[] = ledger.entries.map((entry) => ({
		asset: entry.asset,
		sats:
			entry.held -
			entry.needed +
			(returned.get(entry.asset) ?? 0n) -
			(entry.asset === policyAsset ? estimatedFeeSats : 0n),
	}));

	const locktimeHeight =
		covenantInputs.length > 0 && input.readChainTip
			? await input.readChainTip().catch(() => undefined)
			: undefined;

	const reviewed: ReviewedPlan = {
		action: request.action,
		...(action.boundTo === undefined ? {} : { boundTo: action.boundTo }),
		changeBlinded: change.blinding === "blinded",
		...(changeDeferred ? { changeDeferred: true } : {}),
		...(change.blinding === "blinded"
			? { changeBlindedBy: change.decidedBy }
			: change.overrode === undefined
				? {}
				: { changeOverrode: change.overrode }),
		covenantInputs,
		covenants,
		...(created === undefined ? {} : { createdInstance: created }),
		estimatedFeeSats,
		feeRateSatsPerKvb,
		inputOrder: placement.order,
		issuances: issued.issuances,
		...(locktimeHeight === undefined ? {} : { locktimeHeight }),
		movements,
		outputs,
		policyAsset,
		protocol: manifest.protocol ?? "",
		selected,
		...(sequence === undefined ? {} : { sequence: sequence }),
	};

	return {
		...reviewed,
		confirmation: confirmationModel(reviewed, manifest, action, {
			accountLabel: input.accountLabel,
			policyAsset: input.policyAsset,
			scope,
		}),
	};
}

type ResolvedIssuances = {
	issuances: PlannedIssuance[];
	reserved: { asset: string; inputId: string; utxo: SelectableUtxo }[];
};

function resolveIssuances(
	action: NormalisedAction,
	context: {
		covenantInputs: ReviewedCovenantInput[];
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

		const covenant = context.covenantInputs.find((candidate) => candidate.id === id);

		if (covenant) {
			const outpoint = { txid: covenant.txid, vout: covenant.vout };
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

const FEE_TARGET_BLOCKS = 1;

function feeHeadroomSats(feeRateSatsPerKvb: number): bigint {
	return BigInt(Math.ceil(feeRateSatsPerKvb));
}

function bySize(left: bigint, right: bigint, smallestFirst: boolean): number {
	if (left === right) {
		return 0;
	}

	return left > right === smallestFirst ? 1 : -1;
}

function runActionHooks(action: NormalisedAction, scope: ReferenceScope): ReferenceScope {
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

function sameScript(one: string, other: string): boolean {
	return one.trim().toLowerCase() === other.trim().toLowerCase();
}

function statedIndex(declared: unknown): number | undefined {
	return typeof declared === "number" && Number.isSafeInteger(declared) ? declared : undefined;
}

function malformedDeclaration(action: NormalisedAction): string | undefined {
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
