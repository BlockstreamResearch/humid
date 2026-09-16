import { baseUnits } from "../chain/baseUnits";
import type { ReadChainTip, ReadFeeRate, ReadTxOut } from "../chain/chainRead";
import { byOutpoint, outpointKey } from "../chain/outpoint";
import { type ConfirmationModel, confirmationModel, type ReviewedPlan } from "../confirmation";
import {
	type CompileCovenant,
	type CovenantParamTypesOf,
	type CovenantDerivation,
	covenantMatchesChain,
	deriveCovenantAddress,
} from "../covenants/covenant";
import { type CompileScriptPubKey, covenantHashFrom } from "../covenants/covenantHash";
import { declaredParamTypes } from "../covenants/declaredTypes";
import {
	type CreatedInstance,
	createsInstance,
	resolveCreatedInstance,
} from "../covenants/instance";
import { asArray, asRecord } from "../document/json";
import {
	findAction,
	type NormalisationNote,
	type NormalisedAction,
	normaliseInstance,
	normaliseManifest,
} from "../document/normalise";
import type { ReferenceScope } from "../document/references";
import { type RejectToken, refuseUnsupported } from "../document/refuse";
import { covenantSites } from "../document/sites";
import { assetLedger, type HeldValue, resolveAsset } from "../evaluation/assetLedger";
import type { BlindingWord } from "../evaluation/blinding";
import {
	actionHook,
	inputHook,
	inputHookScope,
	runHook,
	withHookValues,
} from "../evaluation/hooks";
import { type PlaceableInput, placeInputs } from "../evaluation/inputOrder";
import { resolveInputRules, transactionSequence } from "../evaluation/inputRules";
import {
	declaredIssuance,
	issuanceAttributes,
	type PlannedIssuance,
	resolveIssuance,
} from "../evaluation/issuance";
import { fillParameters } from "../evaluation/parameters";
import { planAction } from "../evaluation/plan";
import { checkPositions, type StatedPosition } from "../evaluation/positions";
import { checkValidations } from "../evaluation/validate";
import { resolveStaticWitnesses, type StaticWitness } from "../evaluation/witness";
import { estimateFeeSats } from "../fee";
import type { ParsedLiquidProcessCtParams } from "../request/request";
import { resolveActionRequirements } from "../request/requirements";
import { type AssetHoldings, fundAssets } from "./assetFunding";
import { type SelectableUtxo, toSats } from "./coinSelection";

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
	normalisation: NormalisationNote[];
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

export async function reviewManifestAction(
	request: ParsedLiquidProcessCtParams,
	input: {
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
	},
): Promise<ReviewManifestActionResult> {
	const normalised = normaliseManifest(request.manifest);
	const manifest = normalised.manifest;
	const deployment = normaliseInstance(request.instance);
	const notes: NormalisationNote[] = [...normalised.notes, ...deployment.notes];

	const unsupported = refuseUnsupported(manifest, {
		...(input.compilerVersion === undefined ? {} : { compilerVersion: input.compilerVersion }),
		contractSources: request.contractSources,
	});

	if (unsupported) {
		return { reason: unsupported.reason, refused: true, reject: unsupported.reject };
	}

	const action = findAction(manifest, request.action);

	if (!action) {
		return {
			reason: `The manifest declares no action named "${request.action}".`,
			refused: true,
			reject: "no-such-action",
		};
	}

	const buildMode = manifest.buildMode;

	if (!buildMode.ok) {
		return { reason: buildMode.reason, refused: true, reject: "unreadable-build-mode" };
	}

	const filled = fillParameters(
		action,
		request.params,
		{ instance: deployment.instance.fields, params: request.params },
		notes,
	);

	if (!filled.ok) {
		return { reason: filled.reason, refused: true, reject: filled.reject };
	}

	const malformed = malformedDeclaration(action);

	if (malformed) {
		return { reason: malformed, refused: true, reject: "document-fault" };
	}

	const params = filled.params;
	const requirements = resolveActionRequirements({ ...request, params }, manifest, action);

	if (requirements.missing.length > 0) {
		const named = requirements.missing
			.map((entry) => (entry.keys ? `${entry.reason} (${entry.keys.join(", ")})` : entry.reason))
			.join(" ");

		return {
			reason: `This request cannot be built. ${named}`,
			refused: true,
			reject: "incomplete-request",
		};
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
	let scope: ReferenceScope = {
		inputs,
		instance: deployment.instance.fields,
		params,
	};

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
			notes,
			scope,
			utxoType: site.utxoType,
			wiring: site.wiring,
		});

		if (!derived.ok) {
			return { reason: derived.reason, refused: true, reject: "document-fault" };
		}

		const outpoint = stateOutpoint(request, site.utxoType);

		if (!outpoint) {
			return {
				reason: `The state file lists no ${site.utxoType} to spend.`,
				refused: true,
				reject: "no-utxo-to-spend",
			};
		}

		let onChain;

		try {
			// oxlint-disable-next-line no-await-in-loop
			onChain = await input.readTxOut(outpoint);
		} catch (error) {
			return {
				reason: `Could not read what is at ${outpoint.txid}:${outpoint.vout}: ${String(error)}`,
				refused: true,
				reject: "chain-read-failed",
			};
		}

		const matched = covenantMatchesChain(derived.derivation, onChain.scriptPubKeyHex);

		if (!matched.matched) {
			return { reason: matched.reason, refused: true, reject: "covenant-mismatch" };
		}

		if (onChain.amountSats === undefined || onChain.rawAssetId === undefined) {
			return {
				reason:
					`The ${site.utxoType} at ${outpoint.txid}:${outpoint.vout} did not come back with an ` +
					"explicit amount and asset, so this wallet cannot say what it holds. It will not " +
					"assume a balance for an output it is about to spend.",
				refused: true,
				reject: "unbuildable-utxo-type",
			};
		}

		if (!site.id) {
			return {
				reason:
					`The ${site.utxoType} this action spends holds ${onChain.amountSats} of ` +
					`${onChain.rawAssetId}, and the manifest gives that input no id, so this wallet ` +
					"cannot account for what it brings.",
				refused: true,
				reject: "document-fault",
			};
		}

		const held = baseUnits(onChain.amountSats);

		if (held === undefined) {
			return {
				reason:
					`The ${site.utxoType} at ${outpoint.txid}:${outpoint.vout} came back holding ` +
					`${JSON.stringify(onChain.amountSats)}, which is not an amount this wallet can read. ` +
					"It will not spend an output it cannot say the value of.",
				refused: true,
				reject: "unbuildable-utxo-type",
			};
		}

		inputs[site.id] = { amount_sat: held, asset: onChain.rawAssetId };
		chainHeld.push({ asset: onChain.rawAssetId, id: site.id, sats: held });

		covenantInputs.push({
			argumentsJson: derived.derivation.argumentsJson,
			extraLeavesJson: derived.derivation.extraLeavesJson,
			id: site.id,
			includeDebugSymbols: derived.derivation.includeDebugSymbols,
			...(site.signatureWitness === undefined ? {} : { signatureWitness: site.signatureWitness }),
			source: derived.derivation.source,
			txOutHex: onChain.txOutHex,
			txid: outpoint.txid,
			utxoType: site.utxoType,
			vout: outpoint.vout,
		});
		covenants.push({ ...derived.derivation, role: "spent", verified: "matches-chain" });
	}

	const issued = resolveIssuances(action, {
		covenantInputs,
		holdings,
		inputs,
		notes,
		policyAsset: input.policyAsset,
		scope,
	});

	if (!issued.ok) {
		return { reason: issued.reason, refused: true, reject: issued.reject };
	}

	const hooked = runActionHooks(action, scope, notes);

	if (!hooked.ok) {
		return { reason: hooked.reason, refused: true, reject: "document-fault" };
	}

	scope = hooked.scope;

	const created = createsInstance(action)
		? resolveCreatedInstance(action, {
				contractSources: request.contractSources,
				hashCovenant,
				notes,
				scope,
			})
		: undefined;

	if (created && !created.ok) {
		return { reason: created.reason, refused: true, reject: "document-fault" };
	}

	if (created) {
		scope = { ...scope, instance: { ...scope.instance, ...created.instance.fields } };
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
			notes,
			scope,
			utxoType: site.utxoType,
			wiring: site.wiring,
		});

		if (!derived.ok) {
			return { reason: derived.reason, refused: true, reject: "document-fault" };
		}

		covenants.push({ ...derived.derivation, role: "created", verified: "not-yet-onchain" });
	}

	const stated = resolveStaticWitnesses(action, scope);

	if (!stated.ok) {
		return { reason: stated.reason, refused: true, reject: "document-fault" };
	}

	for (const covenant of covenantInputs) {
		const values = stated.witnesses.get(covenant.id);

		if (values && values.length > 0) {
			covenant.witnessValues = values;
		}
	}

	const plan = planAction(action, scope, notes, manifest.raw.confidential_outputs);

	if (!plan.ok) {
		return { reason: plan.reason, refused: true, reject: "document-fault" };
	}

	const failed = checkValidations(action, scope, notes);

	if (failed) {
		return { reason: failed.reason, refused: true, reject: "document-fault" };
	}

	const inputRules = resolveInputRules(action, scope, notes);

	if (!inputRules.ok) {
		return { reason: inputRules.reason, refused: true, reject: "document-fault" };
	}

	const sequence = transactionSequence(inputRules.rules);

	if (!sequence.ok) {
		return { reason: sequence.reason, refused: true, reject: "unimplemented-construct" };
	}

	let feeRateSatsPerKvb: number;

	try {
		feeRateSatsPerKvb = await input.readFeeRate(FEE_TARGET_BLOCKS);
	} catch (error) {
		return {
			reason: `The wallet could not establish a fee rate, so it will not build this: ${String(error)}`,
			refused: true,
			reject: "no-fee-rate",
		};
	}

	if (!Number.isFinite(feeRateSatsPerKvb) || feeRateSatsPerKvb < 0) {
		return {
			reason:
				`The wallet was given ${feeRateSatsPerKvb} as a fee rate, which is not a rate anything ` +
				"can be charged at. It will not build a transaction it cannot price.",
			refused: true,
			reject: "no-fee-rate",
		};
	}

	const reckoned = assetLedger(action, plan.plan.outputs, {
		held: [
			...chainHeld,
			...issued.issuances.map((issuance) => ({
				asset: issuance.asset,
				created: true as const,
				id: issuance.inputId,
				sats: issuance.assetAmountSats,
			})),
		],
		notes,
		policyAsset: input.policyAsset,
		scope,
	});

	if (!reckoned.ok) {
		return { reason: reckoned.reason, refused: true, reject: reckoned.reject };
	}

	const ledger = reckoned.ledger;
	const policyAsset = input.policyAsset.trim().toLowerCase();

	const networkChange = plan.plan.outputs.filter(
		(planned, at) => planned.target.kind === "change" && ledger.outputs[at] === policyAsset,
	);
	const changeBlinded = networkChange[0]?.blinding.blinding === "hidden";
	const changeOverrode: BlindingWord | undefined =
		networkChange.length === 0 ? "chain" : networkChange[0]?.blinding.overrode;

	const foreign = plan.plan.outputs.find(
		(planned) =>
			planned.blinding.blinding === "hidden" &&
			planned.target.kind !== "change" &&
			planned.target.kind !== "wallet",
	);

	if (foreign) {
		return {
			reason:
				`The output ${foreign.id || "(unnamed)"} must hide what it carries and pays somewhere ` +
				"this wallet holds no blinding key for.",
			refused: true,
			reject: "unimplemented-construct",
		};
	}

	const pinFor = new Map<string, string>();

	for (const rule of inputRules.rules) {
		if (rule.fromAddress !== undefined) {
			pinFor.set(rule.id, rule.fromAddress);
		}
	}

	const fundedInput = new Map(ledger.walletInputs.map((wallet) => [wallet.id, wallet.asset]));

	for (const [id, script] of pinFor) {
		if (!fundedInput.has(id)) {
			return {
				reason:
					`This action requires input ${id} to be funded from ${script}, and that input is ` +
					"not one this wallet funds out of its own outputs.",
				refused: true,
				reject: "document-fault",
			};
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
			return {
				reason:
					`This action requires input ${already.id} to be funded from ${already.script} and ` +
					`input ${wallet.id} from ${script}, and both are funded in ${wallet.asset} out of ` +
					"one selection. This wallet cannot fund one run of outputs from two places.",
				refused: true,
				reject: "no-funds-at-signing-address",
			};
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
			return {
				reason:
					`This action must fund input ${pin.id} from ${pin.script}, and this wallet holds ` +
					`nothing in ${asset} there.`,
				refused: true,
				reject: "no-funds-at-signing-address",
			};
		}
	}

	const misplaced = issued.reserved.find((held) => {
		const script = pinFor.get(held.inputId);

		return script !== undefined && !sameScript(held.utxo.scriptPubKeyHex ?? "", script);
	});

	if (misplaced) {
		return {
			reason:
				`This action must fund input ${misplaced.inputId} from ` +
				`${pinFor.get(misplaced.inputId) ?? ""}, and the output it issues an asset from is not ` +
				"there.",
			refused: true,
			reject: "no-funds-at-signing-address",
		};
	}

	const funding = fundAssets(ledger.entries, {
		feeSats: feeHeadroomSats(feeRateSatsPerKvb),
		headroomSats: 0n,
		holdings: pinnedHoldings,
		policyAsset: input.policyAsset,
		reserved: issued.reserved,
	});

	if (!funding.ok) {
		return { reason: funding.reason, refused: true, reject: funding.reject };
	}

	const fundedFor = new Map(funding.funded.map((entry) => [entry.asset, entry]));

	const covenantScripts = new Map(
		covenants.map((found) => [found.utxoType, found.scriptPubKeyHex]),
	);
	const outputs: ReviewedOutput[] = [];
	const outputAt = new Map<string, number>();
	const returned = new Map<string, bigint>();

	for (const [at, planned] of plan.plan.outputs.entries()) {
		const asset = ledger.outputs[at] ?? policyAsset;

		if (planned.target.kind === "change") {
			const surplus = asset === policyAsset ? 0n : (fundedFor.get(asset)?.changeSats ?? 0n);

			if (surplus <= 0n) {
				continue;
			}

			outputAt.set(planned.id, outputs.length);
			outputs.push({
				asset,
				blinded: planned.blinding.blinding === "hidden",
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
			return {
				reason: `Output ${planned.id} pays a covenant the wallet did not verify.`,
				refused: true,
				reject: "covenant-mismatch",
			};
		}

		if (planned.target.kind === "wallet") {
			returned.set(asset, (returned.get(asset) ?? 0n) + planned.sats);
		}

		outputAt.set(planned.id, outputs.length);
		outputs.push({
			asset,
			blinded: planned.blinding.blinding === "hidden",
			decidedBy: planned.blinding.decidedBy,
			id: planned.id,
			sats: planned.sats,
			scriptPubKeyHex,
		});
	}

	const fundedOrder = [
		...new Set([
			...ledger.walletInputs.map((wallet) => wallet.asset),
			...funding.funded.map((entry) => entry.asset),
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
			return {
				reason: `Input ${id} states a position of ${JSON.stringify(declared.required_index)}, which is not a place in a transaction.`,
				refused: true,
				reject: "unbuildable-position",
			};
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
			return {
				reason: `Output ${id ?? "(unnamed)"} states a position of ${JSON.stringify(declared.required_index)}, which is not a place in a transaction.`,
				refused: true,
				reject: "unbuildable-position",
			};
		}

		if (id === undefined) {
			return {
				reason:
					`This action states a position for an output the manifest gives no id, so this ` +
					"wallet cannot say which output it is or where it landed.",
				refused: true,
				reject: "unbuildable-position",
			};
		}

		positions.push({ at: outputAt.get(id) ?? outputs.length, id, kind: "output", stated: wanted });
	}

	const positioned = checkPositions(positions, {
		inputs: placement.order.length,
		outputs: outputs.length + Math.min(networkChange.length, 1),
	});

	if (!positioned.ok) {
		return { reason: positioned.reason, refused: true, reject: "unbuildable-position" };
	}

	const selected = fundedOrder.flatMap((asset) => fundedFor.get(asset)?.selected ?? []);

	const estimatedFeeSats = estimateFeeSats(
		{
			blindedOutputs: outputs.filter((output) => output.blinded).length + (changeBlinded ? 1 : 0),
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
		changeBlinded,
		...(changeOverrode === undefined ? {} : { changeOverrode }),
		covenantInputs,
		covenants,
		...(created === undefined ? {} : { createdInstance: created.instance }),
		estimatedFeeSats,
		feeRateSatsPerKvb,
		inputOrder: placement.order,
		issuances: issued.issuances,
		...(locktimeHeight === undefined ? {} : { locktimeHeight }),
		movements,
		normalisation: notes,
		outputs,
		policyAsset,
		protocol: manifest.protocol ?? "",
		selected,
		...(sequence.value === undefined ? {} : { sequence: sequence.value }),
	};

	return {
		...reviewed,
		confirmation: confirmationModel(reviewed, manifest, action, {
			accountLabel: input.accountLabel,
			policyAsset: input.policyAsset,
		}),
	};
}

type ResolvedIssuances =
	| {
			issuances: PlannedIssuance[];
			ok: true;
			reserved: { asset: string; inputId: string; utxo: SelectableUtxo }[];
	  }
	| { ok: false; reason: string; reject: RejectToken };

function resolveIssuances(
	action: NormalisedAction,
	context: {
		covenantInputs: ReviewedCovenantInput[];
		holdings: AssetHoldings;
		inputs: Record<string, Record<string, unknown>>;
		notes: NormalisationNote[];
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
			notes: context.notes,
			policyAsset: context.policyAsset,
			scope: context.scope,
		});

		if (!asset.ok) {
			return { ok: false, reason: asset.reason, reject: "foreign-asset" };
		}

		const covenant = context.covenantInputs.find((candidate) => candidate.id === id);

		if (covenant) {
			const outpoint = { txid: covenant.txid, vout: covenant.vout };
			const key = outpointKey(outpoint);

			if (taken.has(key)) {
				return {
					ok: false,
					reason:
						`Input ${id} issues an asset from ${outpoint.txid}:${outpoint.vout}, which ` +
						"another input of this transaction already issues from. One output cannot " +
						"create two assets.",
					reject: "document-fault",
				};
			}

			const issuedHere = resolveIssuance(
				{ declared: issuance, id, outpoint },
				context.scope,
				context.notes,
			);

			if (!issuedHere.ok) {
				return { ok: false, reason: issuedHere.reason, reject: issuedHere.reject };
			}

			taken.add(key);
			issuances.push(issuedHere.issuance);
			context.inputs[id] = {
				...context.inputs[id],
				...issuanceAttributes(issuedHere.issuance),
			};

			continue;
		}

		const funding = spareIn(asset.id);

		if (!funding) {
			return {
				ok: false,
				reason:
					`Input ${id} issues an asset, which needs one of this wallet's own outputs in ` +
					`${asset.id} to derive it from, and there is none left to use.`,
				reject: "shortfall",
			};
		}

		const resolved = resolveIssuance(
			{ declared: issuance, id, outpoint: { txid: funding.txid, vout: funding.vout } },
			context.scope,
			context.notes,
		);

		if (!resolved.ok) {
			return { ok: false, reason: resolved.reason, reject: resolved.reject };
		}

		taken.add(outpointKey(funding));
		reserved.push({ asset: asset.id, inputId: id, utxo: funding });
		issuances.push(resolved.issuance);
		context.inputs[id] = { ...context.inputs[id], ...issuanceAttributes(resolved.issuance) };
	}

	return { issuances, ok: true, reserved };
}

const FEE_TARGET_BLOCKS = 1;

function feeHeadroomSats(feeRateSatsPerKvb: number): bigint {
	return BigInt(Math.ceil(feeRateSatsPerKvb));
}

function stateOutpoint(
	request: ParsedLiquidProcessCtParams,
	utxoType: string,
): { txid: string; vout: number } | undefined {
	for (const entry of asArray(request.state?.utxos)) {
		const utxo = asRecord(entry);

		if (utxo?.utxo_type !== utxoType) {
			continue;
		}

		if (typeof utxo.txid === "string" && typeof utxo.vout === "number") {
			return { txid: utxo.txid, vout: utxo.vout };
		}
	}

	return undefined;
}

function bySize(left: bigint, right: bigint, smallestFirst: boolean): number {
	if (left === right) {
		return 0;
	}

	return left > right === smallestFirst ? 1 : -1;
}

type HookedScope = { ok: false; reason: string } | { ok: true; scope: ReferenceScope };

function runActionHooks(
	action: NormalisedAction,
	scope: ReferenceScope,
	notes: NormalisationNote[],
): HookedScope {
	let running = scope;

	for (const entry of asArray(action.node.inputs)) {
		const declared = asRecord(entry);

		if (!declared) {
			continue;
		}

		const id = typeof declared.id === "string" ? declared.id : "(unnamed)";
		const hook = inputHook(declared);

		if (hook.kind === "malformed") {
			return { ok: false, reason: `Input ${id}: ${hook.reason}` };
		}

		if (hook.kind === "absent") {
			continue;
		}

		const ran = runHook(hook.set, inputHookScope(running, running.inputs?.[id] ?? {}), notes);

		if (!ran.ok) {
			return ran;
		}

		running = withHookValues(running, ran.values);
	}

	const hook = actionHook(action);

	if (hook.kind === "malformed") {
		return { ok: false, reason: `${action.name}: ${hook.reason}` };
	}

	if (hook.kind === "absent") {
		return { ok: true, scope: running };
	}

	const ran = runHook(hook.set, running, notes);

	return ran.ok ? { ok: true, scope: withHookValues(running, ran.values) } : ran;
}

function sameScript(one: string, other: string): boolean {
	return one.trim().toLowerCase() === other.trim().toLowerCase();
}

function statedIndex(declared: unknown): number | undefined {
	return typeof declared === "number" && Number.isSafeInteger(declared) ? declared : undefined;
}

function malformedDeclaration(action: NormalisedAction): string | undefined {
	const node = action.node;

	for (const key of ["inputs", "outputs", "validations"] as const) {
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
