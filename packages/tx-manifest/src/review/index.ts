import type { ReadFeeRate, ReadTxOut } from "../chain/chainRead";
import { type ConfirmationModel, confirmationModel } from "../confirmation";
import { resolveComputedParams } from "../covenants/computed";
import {
	type CompileCovenant,
	covenantMatchesChain,
	deriveCovenantAddress,
} from "../covenants/covenant";
import { type CompileScriptPubKey, covenantHashFrom } from "../covenants/covenantHash";
import { createsInstance, resolveCreatedInstance } from "../covenants/instance";
import { asArray, asRecord } from "../document/json";
import {
	findAction,
	type NormalisationNote,
	type NormalisedAction,
	normaliseInstance,
	normaliseManifest,
} from "../document/normalise";
import type { ReferenceScope } from "../document/references";
import { buildMode, type RejectToken, refuseUnsupported } from "../document/refuse";
import { type ConstructFinding, ignored, inspectConstructs } from "../document/registry";
import { covenantSites } from "../document/sites";
import {
	actionHook,
	inputHook,
	inputHookScope,
	runHook,
	withHookValues,
} from "../evaluation/hooks";
import { type InputRule, resolveInputRules } from "../evaluation/inputRules";
import {
	declaredIssuance,
	issuanceAttributes,
	type PlannedIssuance,
	resolveIssuance,
} from "../evaluation/issuance";
import { planAction } from "../evaluation/plan";
import { checkValidations } from "../evaluation/validate";
import { estimateFeeSats } from "../fee";
import type { ParsedLiquidProcessCtParams } from "../request/request";
import { resolveActionRequirements } from "../request/requirements";
import { type CoinSelection, type SelectableUtxo, selectCoins, toSats } from "./coinSelection";

/**
 * What the wallet established for itself about one covenant this action touches.
 *
 * `verified` is the wallet's own finding, never the site's claim. A covenant the action
 * creates has nothing to compare against yet — its protection is that the destination is
 * derived rather than supplied — and says so rather than reporting a check it did not do.
 */
export type CovenantFinding = {
	address: string;
	/** What an output pays to, which is not the address and is not interchangeable with it. */
	scriptPubKeyHex: string;
	role: "created" | "spent";
	utxoType: string;
	verified: "matches-chain" | "not-yet-on-chain";
};

/**
 * One covenant the transaction spends, with everything needed to spend it.
 *
 * The source and arguments are the ones the wallet verified against the chain, not a
 * second copy read out of the request again.
 */
export type ReviewedCovenantInput = {
	argumentsJson: string;
	/** The manifest's id for the input, so what the action requires of it can be found. */
	id: string;
	/**
	 * The witness the signer must fill with a signature over this transaction.
	 *
	 * Carried through from the manifest's own declaration because the alternative is not
	 * signing it: a covenant whose program asserts a signature cannot be satisfied by anything
	 * the request supplies, and leaving this unset makes the spend fail at signing rather than
	 * anywhere a person could act on.
	 */
	signatureWitness?: string;
	source: string;
	txOutHex: string;
	txid: string;
	vout: number;
};

/** One output of the transaction the wallet worked out, ready to be shown and then built. */
export type ReviewedOutput = {
	id: string;
	sats: bigint;
	scriptPubKeyHex: string;
};

/**
 * Everything the wallet established, worked out and decided — before anyone approves it.
 *
 * The transaction is settled here rather than after the confirmation deliberately: what a
 * person is asked to approve should be the transaction that gets signed, not a description
 * of one that will be assembled afterwards from the same inputs and might not match.
 * Signing is the only thing left for `execute`.
 */
export type ManifestReview = {
	action: string;
	covenants: CovenantFinding[];
	/** The covenant outputs this action spends, ready to be added as inputs. */
	covenantInputs: ReviewedCovenantInput[];
	/**
	 * What the wallet worked out this will cost, from the shape of the transaction it built.
	 *
	 * An estimate rather than the charged figure, and the two differ: the fee that is charged
	 * comes from the weight of the signed transaction, which does not exist until after the
	 * person agrees. The difference returns to them as change.
	 */
	estimatedFeeSats: bigint;
	/** What the wallet will pay per kilo-vbyte, established from the chain rather than from the request. */
	feeRateSatsPerKvb: number;
	/**
	 * Constructs the manifest carries that this runtime did not act on and did not need to.
	 *
	 * Recorded rather than dropped: a construct that changes nothing still tells a reader
	 * which parts of a document the wallet did not read, and a wallet that ignores something
	 * silently is indistinguishable from one that missed it.
	 */
	ignoredConstructs: ConstructFinding[];
	/**
	 * The assets this action creates, each with the output of the wallet's it is derived from.
	 *
	 * An asset id is a function of the output the issuing input spends, so the two are kept
	 * together: separated, nothing downstream could tell whether the id belongs to the output
	 * the transaction actually spends or to one considered and dropped.
	 */
	issuances: PlannedIssuance[];
	/**
	 * Everything the person is shown, with every value's origin attached.
	 *
	 * Built here rather than at the surface because this is where what the wallet established
	 * is known — a surface handed plain values would have to guess which of them were the
	 * site's word, and guessing is the failure the provenance exists to prevent.
	 */
	confirmation: ConfirmationModel;
	/** Legacy spellings the document used, so the generation it came from can be reported. */
	normalisation: NormalisationNote[];
	outputs: ReviewedOutput[];
	protocol: string;
	/** What each input must carry beyond its source, when the action says so. */
	inputRules: InputRule[];
	/** The wallet's own outputs that fund this, chosen by the wallet. */
	selected: SelectableUtxo[];
};

export type ReviewRefusal = {
	reason: string;
	refused: true;
	/** Which refusal this is, for a caller that has to branch rather than read. */
	reject: RejectToken;
};

export type ReviewManifestActionResult = ManifestReview | ReviewRefusal;

export function isRefusal(result: ReviewManifestActionResult): result is ReviewRefusal {
	return "refused" in result;
}

/**
 * Establishes what the wallet knows about an action before anyone is asked to approve it.
 *
 * Runs before the permission gate deliberately: a standing permission skips the prompt,
 * so this is the only thing between a request and a signature. Everything it cannot
 * establish is a refusal — there is no return value that means "probably fine".
 *
 * The document is normalised once, here, and everything downstream reads that rather than
 * the request's raw JSON. That is what makes the two declaration shapes and the two
 * reference namespaces indistinguishable to the rest of the wallet instead of a condition
 * each reader has to remember.
 */
export async function reviewManifestAction(
	request: ParsedLiquidProcessCtParams,
	input: {
		compile: CompileCovenant;
		/** The wallet's spendable outputs, and where its own change and payments go. */
		fundingUtxos: SelectableUtxo[];
		network: string;
		readFeeRate: ReadFeeRate;
		readTxOut: ReadTxOut;
		/** The SimplicityHL version compiled into this wallet, which is the only one it has. */
		compilerVersion: string;
		/** How this account is named to the person, since the wallet chose it implicitly. */
		accountLabel: string;
		/** The asset this wallet pays fees in and is the only one it moves. */
		policyAsset: string;
		/** Compiles a contract to the scriptPubKey it locks to, for the hashes a manifest computes. */
		scriptPubKeyOf: CompileScriptPubKey;
		walletScriptPubKeyHex: string;
	},
): Promise<ReviewManifestActionResult> {
	const normalised = normaliseManifest(request.manifest);
	const manifest = normalised.manifest;
	const deployment = normaliseInstance(request.instance);
	const notes: NormalisationNote[] = [...normalised.notes, ...deployment.notes];

	// Everything the wallet will not build, before it builds anything. A refusal here is a
	// refusal: nothing downstream turns one into a prompt.
	const refusal = refuseUnsupported(manifest, {
		compilerVersion: input.compilerVersion,
		contractSources: request.contractSources,
		policyAsset: input.policyAsset,
	});

	if (refusal) {
		return { reason: refusal.reason, refused: true, reject: refusal.reject };
	}

	const requirements = resolveActionRequirements(request, manifest);

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

	const action = findAction(manifest, request.action);

	if (!action) {
		return {
			reason: `The manifest declares no action named "${request.action}".`,
			refused: true,
			reject: "no-such-action",
		};
	}

	const declaredTypes = declaredParamTypes(action.node);
	const covenants: CovenantFinding[] = [];
	const covenantInputs: ReviewedCovenantInput[] = [];
	/** What each covenant input actually holds, read from the chain rather than told. */
	const inputs: Record<string, Record<string, unknown>> = {};
	/** Which output each input spends, for the ones whose identity an issuance depends on. */
	const spent = new Map<string, { txid: string; vout: number }>();

	// The parameters a manifest works out for itself come first: a covenant compiled with
	// another covenant's hash needs that hash before its own address can be derived, and a
	// hash cannot depend on what the chain reports at an address that does not exist yet.
	const computed = resolveComputedParams(action, {
		contractSources: request.contractSources,
		hashCovenant: covenantHashFrom(input.scriptPubKeyOf),
		notes,
		scope: { instance: deployment.instance.fields, params: request.params },
	});

	if (!computed.ok) {
		return { reason: computed.reason, refused: true, reject: "document-fault" };
	}

	// A constructor has no deployment to read and creates one instead, so its field values are
	// worked out here rather than arriving with the request. They join the scope under the same
	// name every other reference reads, because the covenant this action locks funds into is
	// compiled with the deployment it is creating.
	const created = createsInstance(action)
		? resolveCreatedInstance(action, {
				contractSources: request.contractSources,
				hashCovenant: covenantHashFrom(input.scriptPubKeyOf),
				notes,
				scope: {
					instance: deployment.instance.fields,
					params: { ...request.params, ...computed.values },
				},
			})
		: undefined;

	if (created && !created.ok) {
		return { reason: created.reason, refused: true, reject: "document-fault" };
	}

	let scope: ReferenceScope = {
		inputs,
		instance: created
			? { ...deployment.instance.fields, ...created.instance.fields }
			: deployment.instance.fields,
		params: { ...request.params, ...computed.values },
	};

	for (const site of covenantSites(action)) {
		// Sequential on purpose, and the rule is disabled here rather than obeyed. This loop
		// returns on the first site it refuses, so running the sites concurrently would compile
		// contracts and send chain reads for covenants after the answer is already known, and
		// would make which refusal a person is shown depend on which request finished first
		// instead of on the order the manifest declares. A covenant is refused in declared order
		// or not at all.
		// oxlint-disable-next-line no-await-in-loop
		const derived = await deriveCovenantAddress(manifest, {
			compile: input.compile,
			contractSources: request.contractSources,
			declaredTypes,
			includeDebugSymbols: buildMode(manifest),
			network: input.network,
			notes,
			scope,
			utxoType: site.utxoType,
			wiring: site.wiring,
		});

		if (!derived.ok) {
			return { reason: derived.reason, refused: true, reject: "document-fault" };
		}

		if (site.role === "created") {
			covenants.push({
				address: derived.derivation.address,
				role: "created",
				scriptPubKeyHex: derived.derivation.scriptPubKeyHex,
				utxoType: site.utxoType,
				verified: "not-yet-on-chain",
			});

			continue;
		}

		const outpoint = findStateOutpoint(request, site.utxoType);

		if (!outpoint) {
			return {
				reason: `The state file lists no ${site.utxoType} to spend.`,
				refused: true,
				reject: "no-utxo-to-spend",
			};
		}

		if (site.id) {
			spent.set(site.id, outpoint);
		}

		let onChain;

		try {
			// Same loop, same reason: the first refusal wins, so nothing after it is worth reading.
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

		if (onChain.amountSats !== undefined && site.id) {
			// The asset is recorded beside the amount because an input's own hook reads it under
			// the bare name `asset`, and a hook that could not see it would set a field of the
			// deployment from nothing.
			inputs[site.id] = {
				amount_sat: BigInt(onChain.amountSats),
				...(onChain.rawAssetId === undefined ? {} : { asset: onChain.rawAssetId }),
			};
		}

		if (onChain.amountSats === undefined || onChain.rawAssetId === undefined) {
			return {
				reason:
					`The ${site.utxoType} at ${outpoint.txid}:${outpoint.vout} is confidential. ` +
					"A covenant output cannot be, because Simplicity cannot read a confidential commitment.",
				refused: true,
				reject: "unbuildable-utxo-type",
			};
		}

		const { txOutHex } = onChain;

		covenantInputs.push({
			argumentsJson: derived.derivation.argumentsJson,
			id: site.id,
			...(site.signatureWitness === undefined ? {} : { signatureWitness: site.signatureWitness }),
			source: derived.derivation.source,
			txOutHex,
			txid: outpoint.txid,
			vout: outpoint.vout,
		});

		covenants.push({
			address: derived.derivation.address,
			role: "spent",
			scriptPubKeyHex: derived.derivation.scriptPubKeyHex,
			utxoType: site.utxoType,
			verified: "matches-chain",
		});
	}

	// An asset an action creates is derived from the output its issuing input spends, so that
	// output is settled here rather than at the selection below: an input's own hook reads the
	// asset as soon as the input resolves, and an id derived from an output the wallet had not
	// yet committed to spending would be an id for a different asset.
	const issued = resolveIssuances(action, {
		fundingUtxos: input.fundingUtxos,
		inputs,
		notes,
		scope,
		spent,
	});

	if (!issued.ok) {
		return { reason: issued.reason, refused: true, reject: issued.reject };
	}

	// Hooks run after every input is resolved and before anything is built, which is what
	// makes them able to say what an input turned out to hold. An input's own hook goes first
	// and in declaration order, then the action's, because a document's later line may read
	// what an earlier one set — and every output amount and validation below reads the result.
	const hooked = runActionHooks(action, scope, notes);

	if (!hooked.ok) {
		return { reason: hooked.reason, refused: true, reject: "document-fault" };
	}

	scope = hooked.scope;

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

	// The fee is planned for twice. An amount can be a function of the fee — "pay out what
	// this input holds, less what the network takes" — and the fee depends on the shape of
	// the transaction those amounts appear in, so a draft is planned against a fee of zero
	// purely to learn the shape, and the real pass runs against the figure that shape costs.
	//
	// One pass is enough because an amount does not change what a transaction weighs: in
	// Elements a value occupies a fixed size whatever its magnitude. Without that property
	// this would not converge.
	const draft = planAction(action, { ...scope, fee: 0n }, notes);

	if (!draft.ok) {
		return { reason: draft.reason, refused: true, reject: "document-fault" };
	}

	const estimatedFee = estimateFeeSats(
		{
			covenantInputs: covenantInputs.length,
			outputs: draft.plan.outputs.length,
			// The wallet has not chosen the rest of its inputs yet, and one is the common case; a
			// selection that takes more is priced below, before anything is committed to. The
			// outputs already committed to for an issuance are not a guess and are counted.
			walletInputs: Math.max(1, issued.reserved.length),
		},
		feeRateSatsPerKvb,
	);

	const plan = planAction(action, { ...scope, fee: estimatedFee }, notes);

	if (!plan.ok) {
		return { reason: plan.reason, refused: true, reject: "document-fault" };
	}

	// What the action requires of each input beyond where the money comes from: a relative
	// timelock a covenant may depend on, and an address it may pin funding to.
	const inputRules = resolveInputRules(action, { ...scope, fee: estimatedFee }, notes);

	if (!inputRules.ok) {
		return { reason: inputRules.reason, refused: true, reject: "document-fault" };
	}

	// The protocol's own rules about this action, checked once its amounts are known — a rule
	// comparing an amount cannot be checked before there is one.
	const failed = checkValidations(action, { ...scope, fee: estimatedFee }, notes);

	if (failed) {
		return { reason: failed.reason, refused: true, reject: "document-fault" };
	}

	const covenantScripts = new Map(
		covenants.map((found) => [found.utxoType, found.scriptPubKeyHex]),
	);
	const outputs: ReviewedOutput[] = [];

	for (const planned of plan.plan.outputs) {
		if (planned.target.kind === "change" || planned.sats === undefined) {
			continue;
		}

		// A covenant output pays the address the wallet derived, never one the request
		// supplied. There is no path from a site-supplied address to a transaction output.
		// An op_return pays to the bytes the plan encoded: it is the output, and paying it to
		// the wallet instead would drop what the protocol published and pay nothing to nobody.
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

		outputs.push({ id: planned.id, sats: planned.sats, scriptPubKeyHex });
	}

	// An action pinning an input to one address restricts what the wallet may fund it from.
	// A protocol requiring a specific address is usually requiring a specific key, and funding
	// it from whatever the wallet happens to hold builds a transaction it did not ask for.
	const pinned = inputRules.rules.find((rule) => rule.fromAddress !== undefined)?.fromAddress;
	const fundable = (
		pinned === undefined
			? input.fundingUtxos
			: input.fundingUtxos.filter((utxo) => utxo.scriptPubKeyHex === pinned)
	).filter((utxo) => !issued.reserved.includes(utxo));

	if (pinned !== undefined && fundable.length === 0 && issued.reserved.length === 0) {
		return {
			reason: `This action must be funded from ${pinned}, and this wallet holds nothing there.`,
			refused: true,
			reject: "no-funds-at-signing-address",
		};
	}

	// An output committed to for an issuance was chosen before the action's address pin could
	// be resolved, because the asset id depends on it and the hooks that read that id run
	// first. Where the two disagree the action is refused rather than built from the other
	// output: moving the issuance would mint a different asset than the one already computed.
	const misplaced =
		pinned === undefined
			? undefined
			: issued.reserved.find((utxo) => utxo.scriptPubKeyHex !== pinned);

	if (misplaced) {
		return {
			reason:
				`This action must be funded from ${pinned}, and the output it issues an asset from ` +
				"is not there.",
			refused: true,
			reject: "no-funds-at-signing-address",
		};
	}

	// What the outputs committed to for an issuance already bring, which the selection below
	// does not have to find again.
	const held = issued.reserved.reduce((total, utxo) => total + toSats(utxo.amount), 0n);
	const outstanding = plan.plan.fundingSats - held;
	const selection: CoinSelection =
		outstanding > 0n
			? selectCoins(fundable, outstanding, BigInt(Math.ceil(feeRateSatsPerKvb)))
			: { ok: true, selected: [], totalSats: held };

	if (!selection.ok) {
		return { reason: selection.reason, refused: true, reject: "shortfall" };
	}

	const review: ManifestReview = {
		action: request.action,
		confirmation: {} as ConfirmationModel,
		covenantInputs,
		covenants,
		estimatedFeeSats: estimatedFee,
		feeRateSatsPerKvb,
		ignoredConstructs: ignored(inspectConstructs(manifest)),
		issuances: issued.issuances,
		normalisation: notes,
		outputs,
		inputRules: inputRules.rules,
		protocol: manifest.protocol ?? "",
		// The outputs an issuance is derived from come first and in the order the action
		// declares them, because each asset id is a statement about one of them.
		selected: [...issued.reserved, ...selection.selected],
	};

	return {
		...review,
		confirmation: confirmationModel(review, manifest, action, {
			accountLabel: input.accountLabel,
			policyAsset: input.policyAsset,
		}),
	};
}

/** Confirmation target for the fee estimate, in blocks. */
const FEE_TARGET_BLOCKS = 6;

type ResolvedIssuances =
	| { issuances: PlannedIssuance[]; ok: true; reserved: SelectableUtxo[] }
	| { ok: false; reason: string; reject: RejectToken };

/**
 * Works out every asset this action creates, and which output each one is derived from.
 *
 * A covenant input already has an output: the state file named it and the chain confirmed
 * what is there. An input the wallet funds does not, and this is where it gets one — the
 * asset id is a function of that output, so choosing it later would mean deriving an id for
 * an output the transaction might not spend.
 *
 * The chosen output is returned as reserved rather than merely noted. Everything after this
 * treats the funding pool as what is left, because an output spent twice is not a
 * transaction, and an issuance derived from one the wallet then declined to spend is worse:
 * it is a well-formed id for an asset that would never exist.
 */
function resolveIssuances(
	action: NormalisedAction,
	context: {
		fundingUtxos: SelectableUtxo[];
		/** What the wallet established about each input, which the issued asset joins. */
		inputs: Record<string, Record<string, unknown>>;
		notes: NormalisationNote[];
		scope: ReferenceScope;
		spent: Map<string, { txid: string; vout: number }>;
	},
): ResolvedIssuances {
	const issuances: PlannedIssuance[] = [];
	const reserved: SelectableUtxo[] = [];

	// Smallest first, and it is a choice about what is left rather than about this input: an
	// issuance needs an output's identity and not its value, so taking the smallest leaves the
	// most behind to fund the action with. Nothing here honours an amount the input declares
	// for itself — no wallet input's amount is honoured today — which is recorded rather than
	// hidden, because a protocol whose issuing input is also its collateral gets an output
	// chosen for the wrong reason.
	const spare = context.fundingUtxos
		.filter((utxo) => utxo.spendable && !utxo.confidential)
		.toSorted((one, other) => (toSats(one.amount) > toSats(other.amount) ? 1 : -1));

	for (const entry of asArray(action.node.inputs)) {
		const declared = asRecord(entry);
		const issuance = declared && declaredIssuance(declared);

		if (!declared || !issuance) {
			continue;
		}

		const id = typeof declared.id === "string" ? declared.id : "(unnamed)";
		const onChain = context.spent.get(id);
		const funding = onChain ? undefined : spare[reserved.length];
		const outpoint = onChain ?? (funding && { txid: funding.txid, vout: funding.vout });

		if (!outpoint) {
			return {
				ok: false,
				reason:
					`Input ${id} issues an asset, which needs one of this wallet's own outputs to ` +
					"derive it from, and there is none left to use.",
				reject: "shortfall",
			};
		}

		const resolved = resolveIssuance(
			{ declared: issuance, id, outpoint },
			context.scope,
			context.notes,
		);

		if (!resolved.ok) {
			return resolved;
		}

		if (funding) {
			reserved.push(funding);
		}

		issuances.push(resolved.issuance);
		context.inputs[id] = {
			...context.inputs[id],
			...issuanceAttributes(resolved.issuance),
		};
	}

	return { issuances, ok: true, reserved };
}

function findStateOutpoint(
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

function declaredParamTypes(action: Record<string, unknown>): Record<string, string> {
	const types: Record<string, string> = {};

	for (const [name, declared] of Object.entries(asRecord(action.params) ?? {})) {
		const type = asRecord(declared)?.type;

		if (typeof type === "string") {
			types[name] = type;
		}
	}

	return types;
}

/**
 * Runs every hook this action declares, in the order the format defines.
 *
 * Each input's own hook first — in declaration order, each against a scope carrying what the
 * hooks before it set — and then the action's own. An input's hook reads two bare names that
 * mean the input being resolved rather than anything in scope, so it is given a scope of its
 * own rather than the shared one.
 */
function runActionHooks(
	action: NormalisedAction,
	scope: ReferenceScope,
	notes: NormalisationNote[],
): { ok: false; reason: string } | { ok: true; scope: ReferenceScope } {
	let running = scope;

	for (const entry of asArray(action.node.inputs)) {
		const declared = asRecord(entry);
		const set = declared && inputHook(declared);

		if (!declared || !set) {
			continue;
		}

		const id = typeof declared.id === "string" ? declared.id : undefined;
		const resolved = id ? (running.inputs?.[id] ?? {}) : {};
		const ran = runHook(set, inputHookScope(running, resolved), notes);

		if (!ran.ok) {
			return ran;
		}

		running = withHookValues(running, ran.values);
	}

	const set = actionHook(action);

	if (!set) {
		return { ok: true, scope: running };
	}

	const ran = runHook(set, running, notes);

	return ran.ok ? { ok: true, scope: withHookValues(running, ran.values) } : ran;
}
