import type { ReadChainTip, ReadFeeRate, ReadTxOut } from "../chain/chainRead";
import { type ConfirmationModel, confirmationModel } from "../confirmation";
import { resolveComputedParams } from "../covenants/computed";
import {
	type CompileCovenant,
	type ContractParamTypesOf,
	covenantMatchesChain,
	deriveCovenantAddress,
} from "../covenants/covenant";
import { type CompileScriptPubKey, covenantHashFrom } from "../covenants/covenantHash";
import { declaredParamTypes } from "../covenants/declaredTypes";
import { completeSuppliedInstance } from "../covenants/instance";
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
import { buildMode, type RejectToken, refuseUnsupported } from "../document/refuse";
import { type ConstructFinding, ignored, inspectConstructs } from "../document/registry";
import { covenantSites } from "../document/sites";
import { assetLedger, type HeldValue, resolveAsset } from "../evaluation/assetLedger";
import type { BlindingDecision, BlindingWord } from "../evaluation/blinding";
import {
	actionHook,
	inputHook,
	inputHookScope,
	runHook,
	withHookValues,
} from "../evaluation/hooks";
import { type PlaceableInput, placeInputs } from "../evaluation/inputOrder";
import { type InputRule, resolveInputRules } from "../evaluation/inputRules";
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
import { type StaticWitness, resolveStaticWitnesses } from "../evaluation/witness";
import { estimateFeeSats } from "../fee";
import type { ParsedLiquidProcessCtParams } from "../request/request";
import { resolveActionRequirements } from "../request/requirements";
import { type AssetHoldings, fundAssets } from "./assetFunding";
import { type SelectableUtxo, toSats } from "./coinSelection";

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
	/**
	 * The extra taproot leaves and the build mode this covenant was verified under.
	 *
	 * Carried because the module that spends it compiles the contract again, and a compile that
	 * differs in either produces a different script — which the covenant's own execution then
	 * rejects, after a person has approved a transaction the wallet had already checked.
	 */
	extraLeavesJson: string;
	includeDebugSymbols: boolean;
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
	/**
	 * The values this input's contract needs supplied rather than signed.
	 *
	 * A covenant with more than one branch is told which one to run by a witness the document
	 * states outright. Carried through unparsed, because the compiler that type-checks a
	 * SimplicityHL literal is the authority on what it means and this package is not.
	 */
	witnessValues?: StaticWitness[];
};

/**
 * One input of the transaction, in the place the wallet is to build it.
 *
 * Carries the piece itself rather than a number pointing into one of the two lists the review
 * also reports, because a caller holding a number has to be told which list it counts along and
 * can be told wrongly. What is here is what to add; there is nothing to look up.
 */
export type PlannedInput =
	| { covenant: ReviewedCovenantInput; source: "covenant" }
	| { source: "wallet"; utxo: SelectableUtxo };

/** One output of the transaction the wallet worked out, ready to be shown and then built. */
export type ReviewedOutput = {
	/**
	 * The asset this output pays in, as the chain writes the id.
	 *
	 * Carried rather than assumed, because assuming it is what limited this wallet to one asset:
	 * a builder told only an amount pays it in whatever asset it defaults to, and a document
	 * moving a token would have had its token quietly paid out as money.
	 */
	asset: string;
	/**
	 * Whether this output hides what it carries, decided by the order the format defines.
	 *
	 * Carried rather than left to the builder, because the decision is the document's and the
	 * builder has never read the document. An output built the wrong way here is one whose
	 * amount is published when the protocol meant it kept, and nothing later could tell.
	 */
	blinded: boolean;
	/**
	 * Whose word that was: the output's own, the document's, the network's, or this wallet's.
	 *
	 * The answer and the word behind it are different facts, and only the answer reaches the
	 * builder. "This protocol asked for it" and "nobody said, and this network hides by
	 * default" build the identical output and are not the identical sentence, and a person
	 * deciding whether to trust a site is owed the difference.
	 */
	decidedBy: BlindingDecision["decidedBy"];
	id: string;
	/**
	 * The word this wallet set aside, present only on change it published over the format.
	 *
	 * Absent everywhere else, because everywhere else the wallet follows the format and has
	 * nothing to have overridden.
	 */
	overrode?: BlindingWord;
	sats: bigint;
	scriptPubKeyHex: string;
};

/**
 * What one asset this transaction moves does to the wallet's own balance.
 *
 * One of these per asset rather than one figure for the transaction, because a figure for the
 * transaction can only be written by adding assets together, and assets do not add. A person
 * approving a swap is agreeing to two different sentences at once, and both have to be on the
 * screen for either to be true.
 */
export type AssetMovement = {
	/** The asset, by the id the chain knows it as. */
	asset: string;
	/** Base units this wallet's balance changes by, negative when it is paying out. */
	sats: bigint;
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
	/**
	 * Whether the change this transaction returns hides what it carries.
	 *
	 * Change is an output like any other in the document's eyes, and the corpus declares one
	 * for almost every action while saying nothing about it — so the format's own answer is the
	 * network's default, and on Liquid that means hidden. This wallet publishes it instead, so
	 * the money returns in a form the next action can be funded from.
	 *
	 * Still derived rather than written as `false`, because the guard checks what was built
	 * against what was decided, and a guard handed a constant checks nothing.
	 */
	changeBlinded: boolean;
	/**
	 * Whose word this wallet set aside to publish that change.
	 *
	 * Present whenever the format would have hidden it, which is every action in the published
	 * corpus — including the ones declaring no change output at all, whose change the signing
	 * module appends and whose silence the network answers the same way. Absent only where a
	 * protocol asked for open change itself, because then nothing was overridden.
	 */
	changeOverrode?: BlindingWord;
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
	 * The block height this transaction declares it may not be mined before.
	 *
	 * Present whenever the action spends a covenant and the wallet could read the chain's
	 * height. A contract branch guarded by `check_lock_height` reads the transaction's own
	 * locktime, so a transaction declaring none satisfies no such branch — and no document in
	 * the corpus states a locktime, because the height a spend is valid at is a fact about the
	 * chain rather than about the protocol. The wallet answers with where the chain is, which
	 * is what every wallet writes there and says nothing about any protocol.
	 *
	 * Absent when the action spends no covenant, or when no chain-tip reader was supplied. A
	 * time-locked branch is then unsatisfiable, and it fails at execution rather than here,
	 * because whether a branch checks a height is inside the contract rather than the document.
	 */
	locktimeHeight?: number;
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
	 * The deployment this action brings into existence, when it creates one.
	 *
	 * Absent for every action that only spends what already exists. Present, it is the record of
	 * a contract that has no history yet: the wallet worked out each field, including the ones
	 * that could not exist until this transaction did, and every covenant this action creates was
	 * compiled from exactly these values.
	 *
	 * Reported rather than kept because the deployment outlives the transaction and nothing else
	 * can reconstruct it. Half of these fields are functions of outputs the wallet chose — an
	 * asset id is derived from the output its issuing input spends — so a caller that had to work
	 * them out again afterwards would be guessing which output the wallet picked.
	 */
	createdInstance?: CreatedInstance;
	/**
	 * Everything the person is shown, with every value's origin attached.
	 *
	 * Built here rather than at the surface because this is where what the wallet established
	 * is known — a surface handed plain values would have to guess which of them were the
	 * site's word, and guessing is the failure the provenance exists to prevent.
	 */
	confirmation: ConfirmationModel;
	/**
	 * What this action does to the wallet's balance, one asset at a time.
	 *
	 * Worked out here because here is where what the covenants hold, what the outputs cost and
	 * what the wallet put in are all known at once. A surface handed the outputs alone would
	 * have to add up assets to reach a single number, which is the sum this bundle removed.
	 */
	movements: AssetMovement[];
	/** Legacy spellings the document used, so the generation it came from can be reported. */
	normalisation: NormalisationNote[];
	outputs: ReviewedOutput[];
	protocol: string;
	/**
	 * The transaction's inputs, in the order they must be added.
	 *
	 * A covenant introspects positions, so the order is part of what the document says rather
	 * than the wallet's to choose. Adding every covenant first and the wallet's own after is one
	 * order among many, and where a document states a position for an input the wallet supplies
	 * it is saying that that one is wrong — a contract asserting its own index will not run
	 * against a transaction built the other way, and nothing after signing could say why.
	 */
	inputOrder: PlannedInput[];
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
		/**
		 * What a contract says the types of its own compile parameters are.
		 *
		 * Injected beside the compile step because it comes from the same place — the compiler —
		 * and a wallet owns that. It is what types the parameters a deployment writes as a bare
		 * value rather than as a name: those carry no declared type at the position they are
		 * written, and a width guessed from the value is part of an address.
		 *
		 * A wallet that supplies none still reviews every covenant whose parameters are all
		 * names, and refuses the ones that are not rather than encoding them on a guess.
		 */
		contractParamTypes?: ContractParamTypesOf;
		/** The wallet's spendable outputs in the asset the network charges its fees in. */
		fundingUtxos: SelectableUtxo[];
		/**
		 * The wallet's spendable outputs in one asset it is not the network's own, by id.
		 *
		 * A function rather than a list because which assets an action moves is not knowable
		 * until its document has been read and its lookups resolved — which happens here. A
		 * wallet that supplies none can fund an action in the network's asset and nothing else,
		 * and is told which asset it was short of rather than left to guess.
		 */
		holdingsOf?: AssetHoldings;
		network: string;
		/**
		 * How high the chain is, asked only when the action spends a covenant.
		 *
		 * Optional because most of what this runtime reviews needs no locktime at all, and a
		 * wallet that supplies none still builds every action whose covenants are not time-locked.
		 */
		readChainTip?: ReadChainTip;
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
	/**
	 * The deployment as the wallet can read it, which is more than the site can hold.
	 *
	 * Half a deployment's fields are covenant script hashes — compiler output — so a site that
	 * did not create the deployment carries the ordinary values and nothing else. The document
	 * says how the rest are computed, in the constructor's own block, and this runtime already
	 * computes them there. Filled in here rather than demanded of the request, because demanding
	 * them asks a site for something only a wallet can make.
	 */
	let deploymentFields: Record<string, unknown> = deployment.instance.fields;

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

	const action = findAction(manifest, request.action);

	if (!action) {
		return {
			reason: `The manifest declares no action named "${request.action}".`,
			refused: true,
			reject: "no-such-action",
		};
	}

	/** One compiler, one build mode, for every hash this document works out for itself. */
	const hashCovenant = covenantHashFrom(input.scriptPubKeyOf, buildMode(manifest));

	// The deployment is completed before anything reads it. A parameter the document computes
	// can name any field of the deployment, including one only a compiler can produce and one
	// the constructor worked out — `CURRENT_DEBT` is both — so filling parameters against the
	// half a site can hold refuses on a field the wallet was about to derive.
	if (Object.keys(deploymentFields).length > 0) {
		const completed = completeSuppliedInstance(manifest, action, deploymentFields, {
			contractSources: request.contractSources,
			hashCovenant,
			notes,
		});

		if (!completed.ok) {
			return { reason: completed.reason, refused: true, reject: "document-fault" };
		}

		deploymentFields = completed.fields;
	}

	// What the protocol already knows the answer to is filled before anything asks whether the
	// request is complete. The other order reports a parameter as missing that the document
	// itself supplies, which sends a site looking for a value it was never meant to send.
	const filled = fillParameters(action, request.params, {
		instance: deploymentFields,
		params: request.params,
	});

	if (!filled.ok) {
		return { reason: filled.reason, refused: true, reject: filled.reject };
	}

	const requirements = resolveActionRequirements({ ...request, params: filled.params }, manifest);

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

	const declaredTypes = declaredParamTypes(manifest, action);
	const covenants: CovenantFinding[] = [];
	const covenantInputs: ReviewedCovenantInput[] = [];
	/** What each covenant input actually holds, read from the chain rather than told. */
	const inputs: Record<string, Record<string, unknown>> = {};
	/** Which output each input spends, for the ones whose identity an issuance depends on. */
	const spent = new Map<string, { txid: string; vout: number }>();
	/**
	 * What each covenant this action spends actually holds, as the chain reports it.
	 *
	 * Kept here rather than read back out of `inputs` because an issuing input's own asset is
	 * written into that record afterwards — so by the time funding is worked out, the entry for
	 * a covenant that issues something says the issued asset rather than the one it holds.
	 */
	const chainHeld: HeldValue[] = [];

	// The parameters a manifest works out for itself come first: a covenant compiled with
	// another covenant's hash needs that hash before its own address can be derived, and a
	// hash cannot depend on what the chain reports at an address that does not exist yet.
	const computed = resolveComputedParams(action, {
		contractSources: request.contractSources,
		hashCovenant,
		notes,
		scope: { instance: deploymentFields, params: filled.params },
	});

	if (!computed.ok) {
		return { reason: computed.reason, refused: true, reject: "document-fault" };
	}

	/** The deployment this action creates, read against whatever is settled at the time. */
	const createdFields = (unresolved: "omit" | "refuse", reading: ReferenceScope) =>
		createsInstance(action)
			? resolveCreatedInstance(action, {
					contractSources: request.contractSources,
					hashCovenant,
					notes,
					scope: reading,
					unresolved,
				})
			: undefined;

	// A constructor has no deployment to read and creates one instead. Only the half of it the
	// request and the existing deployment already determine is known here — the rest is a
	// function of outputs nothing has chosen yet — and that half is needed now, because which
	// asset an issuing input carries is itself one of these fields.
	const known = createdFields("omit", {
		inputs,
		instance: deploymentFields,
		params: { ...filled.params, ...computed.values },
	});

	if (known && !known.ok) {
		return { reason: known.reason, refused: true, reject: "document-fault" };
	}

	let scope: ReferenceScope = {
		inputs,
		instance: known ? { ...deploymentFields, ...known.instance.fields } : deploymentFields,
		params: { ...filled.params, ...computed.values },
	};

	// The covenants this action spends, which are the ones there is something on chain to
	// compare against. The ones it creates are derived further down, after the inputs have
	// produced what only they can — and no refusal changes place by that, because a spent
	// covenant is named by an input and a created one by an output, so the declared order
	// already puts every spent site first.
	for (const site of covenantSites(action).filter((declared) => declared.role === "spent")) {
		// Sequential on purpose, and the rule is disabled here rather than obeyed. This loop
		// returns on the first site it refuses, so running the sites concurrently would compile
		// contracts and send chain reads for covenants after the answer is already known, and
		// would make which refusal a person is shown depend on which request finished first
		// instead of on the order the manifest declares. A covenant is refused in declared order
		// or not at all.
		// oxlint-disable-next-line no-await-in-loop
		const derived = await deriveCovenantAddress(manifest, {
			compile: input.compile,
			contractParamTypes: input.contractParamTypes,
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

		if (site.id) {
			chainHeld.push({
				asset: onChain.rawAssetId,
				id: site.id,
				sats: BigInt(onChain.amountSats),
			});
		}

		covenantInputs.push({
			argumentsJson: derived.derivation.argumentsJson,
			extraLeavesJson: derived.derivation.extraLeavesJson,
			id: site.id,
			includeDebugSymbols: buildMode(manifest),
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

	/**
	 * The wallet's own outputs in one asset, whichever asset an action turns out to move.
	 *
	 * The network's own asset comes from the list the caller always supplies; every other asset
	 * is asked for by id, because which ones there are cannot be known before the document has
	 * been read. A caller that supplies no reader holds nothing in any other asset, which is a
	 * shortfall named by asset rather than a silent refusal.
	 */
	const pools = new Map<string, SelectableUtxo[]>();
	const holdings: AssetHoldings = (asset) => {
		const existing = pools.get(asset);

		if (existing) {
			return existing;
		}

		// Asked for once per asset and kept. A wallet answering this from its own snapshot builds
		// the list fresh each time it is asked, so asking twice yields two lists of equal outputs
		// that share no identity — and the output already committed to for an issuance would be
		// offered again as if it were a different one.
		const pool =
			asset === input.policyAsset.trim().toLowerCase()
				? input.fundingUtxos
				: (input.holdingsOf?.(asset) ?? []);

		pools.set(asset, pool);

		return pool;
	};

	// An asset an action creates is derived from the output its issuing input spends, so that
	// output is settled here rather than at the selection below: an input's own hook reads the
	// asset as soon as the input resolves, and an id derived from an output the wallet had not
	// yet committed to spending would be an id for a different asset.
	const issued = resolveIssuances(action, {
		holdings,
		inputs,
		notes,
		policyAsset: input.policyAsset,
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

	// The deployment being created, now that everything it can depend on exists. Read a second
	// time rather than patched: a field whose value came out of an issuance was not merely
	// missing before, and the covenant hashes among these fields are worked out from all of
	// them at once. What is unresolved here is unresolved for good, and refuses by name.
	const created = createdFields("refuse", scope);

	if (created && !created.ok) {
		return { reason: created.reason, refused: true, reject: "document-fault" };
	}

	if (created) {
		scope = { ...scope, instance: { ...scope.instance, ...created.instance.fields } };
	}

	// The covenants this action creates, derived once the deployment they are compiled with is
	// complete. There is nothing on chain to compare them against — that is the point of
	// creating one — so the wallet reports what it derived and that it derived it, which is a
	// different fact from a check that passed rather than a weaker one.
	for (const site of covenantSites(action).filter((declared) => declared.role === "created")) {
		// Sequential for the same reason the loop above is: the first refusal is the answer.
		// oxlint-disable-next-line no-await-in-loop
		const derived = await deriveCovenantAddress(manifest, {
			compile: input.compile,
			contractParamTypes: input.contractParamTypes,
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

		covenants.push({
			address: derived.derivation.address,
			role: "created",
			scriptPubKeyHex: derived.derivation.scriptPubKeyHex,
			utxoType: site.utxoType,
			verified: "not-yet-on-chain",
		});
	}

	// Stated witness values come after the hooks, because one published protocol selects its
	// branch by a field of its own deployment and a hook is what may have written it.
	const stated = resolveStaticWitnesses(action, scope, notes);

	if (!stated.ok) {
		return { reason: stated.reason, refused: true, reject: "document-fault" };
	}

	for (const covenant of covenantInputs) {
		const values = stated.witnesses.get(covenant.id);

		if (values) {
			covenant.witnessValues = values;
		}
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

	// The fee is planned for twice. An amount can be a function of the fee — "pay out what
	// this input holds, less what the network takes" — and the fee depends on the shape of
	// the transaction those amounts appear in, so a draft is planned against a fee of zero
	// purely to learn the shape, and the real pass runs against the figure that shape costs.
	//
	// One pass is enough because an amount does not change what a transaction weighs: in
	// Elements a value occupies a fixed size whatever its magnitude. Without that property
	// this would not converge.
	const draft = planAction(
		action,
		{ ...scope, fee: 0n },
		notes,
		manifest.node.confidential_outputs,
	);

	if (!draft.ok) {
		return { reason: draft.reason, refused: true, reject: "document-fault" };
	}

	const estimatedFee = estimateFeeSats(
		{
			covenantInputs: covenantInputs.length,
			// Each issuance is a surcharge on an input already counted above, and is known
			// exactly: the outputs it derives from were committed to before this ran.
			issuingInputs: issued.issuances.length,
			outputs: draft.plan.outputs.length,
			// The wallet has not chosen the rest of its inputs yet, and one is the common case; a
			// selection that takes more is priced below, before anything is committed to. The
			// outputs already committed to for an issuance are not a guess and are counted.
			walletInputs: Math.max(1, issued.reserved.length),
		},
		feeRateSatsPerKvb,
	);

	const plan = planAction(
		action,
		{ ...scope, fee: estimatedFee },
		notes,
		manifest.node.confidential_outputs,
	);

	if (!plan.ok) {
		return { reason: plan.reason, refused: true, reject: "document-fault" };
	}

	// Which asset each piece of value is in, decided here because here is the first place it is
	// knowable. The document states an asset as a lookup far more often than as an id, and a
	// lookup resolves against this deployment's fields and the request — both of which have been
	// read by now and neither of which the document carries.
	//
	// What replaced one running total is one per asset. Netting what the covenants hold against
	// what the outputs cost is sound within an asset and meaningless across two: added together,
	// a one-of-a-kind token and a thousand base units of money make a number that describes
	// nothing, and a wallet cannot say which of them it is short of. So each asset is reckoned,
	// funded and returned on its own from here on.
	const reckoned = assetLedger(action, plan.plan.outputs, {
		held: [
			...chainHeld,
			// An issuance creates its units out of nothing, so the transaction brings them rather
			// than the wallet finding them. Left out, the wallet would go looking for an asset
			// that does not exist yet and refuse the action for not holding any of it.
			...issued.issuances.map((issuance) => ({
				asset: issuance.asset,
				created: true as const,
				id: issuance.inputId,
				sats: issuance.assetAmountSats,
			})),
		],
		notes,
		policyAsset: input.policyAsset,
		scope: { ...scope, fee: estimatedFee },
	});

	if (!reckoned.ok) {
		return { reason: reckoned.reason, refused: true, reject: reckoned.reject };
	}

	const ledger = reckoned.ledger;

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

	// An output the document wants hidden is hidden with this wallet's own blinding key, which
	// is the key of the address it pays to. That holds for its own outputs and for its change,
	// and not for an address the document names — there the key belongs to whoever owns that
	// address, and this wallet has no way to obtain it.
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

	const policyAsset = input.policyAsset.trim().toLowerCase();
	/**
	 * The change outputs the signing module appends for itself.
	 *
	 * Only the network's own asset gets one: the fee is charged in it, and what the fee leaves
	 * behind is not known until the signed transaction has been weighed. Every other asset's
	 * change is an exact figure this wallet works out and builds in the position the document
	 * declares it, because nothing takes a bite out of it.
	 */
	const networkChange = plan.plan.outputs.filter(
		(planned, at) => planned.target.kind === "change" && ledger.outputs[at] === policyAsset,
	);
	/** Whether the transaction's own change hides what it carries, by the same order. */
	const changeBlinded = networkChange[0]?.blinding.blinding === "hidden";
	/**
	 * Whose word was set aside to publish it.
	 *
	 * An action declaring no change output still gets one — the module appends it — and the
	 * document's silence about an output it never declared is answered by this network exactly
	 * as its silence about one it did. So the two say the same thing to a person rather than
	 * one of them saying nothing, which is what they did before.
	 */
	const changeOverrode: BlindingWord | undefined =
		networkChange.length === 0 ? "chain" : networkChange[0]?.blinding.overrode;

	// An action pinning an input to one address restricts what the wallet may fund it from.
	// A protocol requiring a specific address is usually requiring a specific key, and funding
	// it from whatever the wallet happens to hold builds a transaction it did not ask for.
	const pinned = inputRules.rules.find((rule) => rule.fromAddress !== undefined)?.fromAddress;
	const pinnedHoldings: AssetHoldings = (asset) =>
		pinned === undefined
			? holdings(asset)
			: holdings(asset).filter((utxo) => utxo.scriptPubKeyHex === pinned);

	if (
		pinned !== undefined &&
		pinnedHoldings(policyAsset).length === 0 &&
		issued.reserved.length === 0
	) {
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
			: issued.reserved.find(({ utxo }) => utxo.scriptPubKeyHex !== pinned);

	if (misplaced) {
		return {
			reason:
				`This action must be funded from ${pinned}, and the output it issues an asset from ` +
				"is not there.",
			refused: true,
			reject: "no-funds-at-signing-address",
		};
	}

	// Each asset funded out of what the wallet holds in that asset, and short in one of them is
	// a refusal that says which one. The fee is added to the network's own asset and to no
	// other: a second asset never becomes a second fee.
	const funding = fundAssets(ledger.entries, {
		feeSats: estimatedFee,
		headroomSats: BigInt(Math.ceil(feeRateSatsPerKvb)),
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
	/** Where each declared output lands, which is not its declared position once one is dropped. */
	const outputAt = new Map<string, number>();
	/** What comes back to this wallet from the action's own outputs, per asset. */
	const returned = new Map<string, bigint>();

	for (const [at, planned] of plan.plan.outputs.entries()) {
		const asset = ledger.outputs[at] ?? policyAsset;

		// Change in the network's own asset is the module's to work out and to append. Change in
		// any other asset is this wallet's, built here in the position the document declares it,
		// for exactly what is left over — and skipped when nothing is, because an output paying
		// nothing is not an output.
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

	// What each asset does to this wallet's balance: what the transaction brings in it, less
	// what the action pays out of it, plus what comes back — and the fee, in the one asset the
	// network charges it in. Change is not added: it is already the difference between the two.
	const movements: AssetMovement[] = ledger.entries.map((entry) => ({
		asset: entry.asset,
		sats:
			entry.held -
			entry.needed +
			(returned.get(entry.asset) ?? 0n) -
			(entry.asset === policyAsset ? estimatedFee : 0n),
	}));

	// The wallet's own outputs, one asset's worth at a time, in the order the action declares the
	// inputs that need them. A pool rather than a running order: which of them lands where is
	// decided below, against what the document states, because a covenant reads positions and
	// appending them after the covenants is the wallet's habit rather than the document's word.
	const fundedOrder = [
		...new Set([
			...ledger.walletInputs.map((wallet) => wallet.asset),
			...funding.funded.map((entry) => entry.asset),
		]),
	];
	const selected = fundedOrder.flatMap((asset) => fundedFor.get(asset)?.selected ?? []);
	/** Which of the chosen outputs build each declared input, in the order they were chosen. */
	const walletRuns = new Map<string, PlannedInput[]>();
	/** A declared input built out of the selection an earlier declaration was credited with. */
	const fundedWith = new Map<string, string>();
	/** Which declared input was credited with each asset's whole selection. */
	const creditedWith = new Map<string, string>();

	for (const wallet of ledger.walletInputs) {
		const credited = creditedWith.get(wallet.asset);

		// Two declared inputs in one asset are funded out of one selection, and nothing in the
		// document says which of the chosen outputs belongs to which of them. The first one is
		// credited with the whole selection; the second is told it lands where that run ends,
		// which is the honest answer to a question the document did not answer.
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

	/** Outputs chosen for an asset no input declares, which is where an undeclared fee is paid. */
	const undeclared = fundedOrder
		.filter((asset) => !creditedWith.has(asset))
		.flatMap((asset) => fundedFor.get(asset)?.selected ?? []);
	/** Every declared input, with what the wallet would build it from and where it must go. */
	const placeable: PlaceableInput<PlannedInput>[] = [];

	for (const entry of asArray(action.node.inputs)) {
		const declared = asRecord(entry);

		if (!declared) {
			continue;
		}

		const id = typeof declared.id === "string" ? declared.id : "(unnamed)";
		const covenant = covenantInputs.find((candidate) => candidate.id === id);
		const slots: PlannedInput[] = covenant
			? [{ covenant, source: "covenant" }]
			: (walletRuns.get(id) ?? []);

		placeable.push({
			id,
			slots,
			...(typeof declared.required_index === "number" ? { stated: declared.required_index } : {}),
		});
	}

	if (undeclared.length > 0) {
		placeable.push({ slots: undeclared.map((utxo) => ({ source: "wallet", utxo })) });
	}

	const placement = placeInputs(placeable);
	/**
	 * Where a declared input landed, which is not always anywhere.
	 *
	 * One funded out of an earlier declaration's selection lands where that run ends, and one the
	 * wallet builds nothing for lands nowhere at all rather than at a number that reads like a
	 * place.
	 */
	const landedAt = (id: string): number | undefined => {
		const own = placement.at.get(id);

		if (own !== undefined) {
			return own;
		}

		const credited = fundedWith.get(id);

		if (credited === undefined) {
			return undefined;
		}

		const start = placement.at.get(credited);

		return start === undefined ? undefined : start + (walletRuns.get(credited)?.length ?? 0);
	};

	// Where each piece actually lands, against where the document says it must. The inputs were
	// laid out above in the order the document states, and the declared outputs are built in
	// order with the network's change last — so the layout is known here, and a piece that could
	// not land where it was asked to is refused by name.
	const positions: StatedPosition[] = [];

	for (const entry of asArray(action.node.inputs)) {
		const declared = asRecord(entry);

		if (!declared || typeof declared.required_index !== "number") {
			continue;
		}

		const id = typeof declared.id === "string" ? declared.id : "(unnamed)";

		positions.push({
			// An input the wallet builds nothing for is counted one past the end, which no stated
			// position can equal: it has no place, and being refused by name is what says so.
			at: landedAt(id) ?? placement.order.length,
			id,
			kind: "input",
			stated: declared.required_index,
		});
	}

	for (const entry of asArray(action.node.outputs)) {
		const declared = asRecord(entry);
		const id = typeof declared?.id === "string" ? declared.id : undefined;

		if (!declared || id === undefined || typeof declared.required_index !== "number") {
			continue;
		}

		// The network's change is appended by the module after everything else, so a document
		// stating a position for it is stating one the wallet could only meet by accident. An
		// output the wallet dropped for paying nothing is counted where it would have been.
		positions.push({
			at: outputAt.get(id) ?? outputs.length,
			id,
			kind: "output",
			stated: declared.required_index,
		});
	}

	const positioned = checkPositions(positions, {
		inputs: placement.order.length,
		outputs: outputs.length + Math.min(networkChange.length, 1),
	});

	if (!positioned.ok) {
		return { reason: positioned.reason, refused: true, reject: "unbuildable-position" };
	}

	/**
	 * Where the chain is, when this action spends a covenant.
	 *
	 * Asked here rather than at the top because most actions never need it, and a failure to
	 * read it is not a reason to refuse an action whose covenants are not time-locked: the
	 * branch that needs a height fails at execution, naming itself, which is a better answer
	 * than refusing everything because one network call did not come back.
	 */
	const locktimeHeight =
		covenantInputs.length > 0 && input.readChainTip
			? await input.readChainTip().catch(() => undefined)
			: undefined;

	const review: ManifestReview = {
		action: request.action,
		confirmation: {} as ConfirmationModel,
		covenantInputs,
		covenants,
		...(created === undefined ? {} : { createdInstance: created.instance }),
		estimatedFeeSats: estimatedFee,
		feeRateSatsPerKvb,
		changeBlinded,
		...(changeOverrode === undefined ? {} : { changeOverrode }),
		ignoredConstructs: ignored(inspectConstructs(manifest)),
		issuances: issued.issuances,
		...(locktimeHeight === undefined ? {} : { locktimeHeight }),
		movements,
		normalisation: notes,
		outputs,
		inputOrder: placement.order,
		inputRules: inputRules.rules,
		protocol: manifest.protocol ?? "",
		// Each asset's own outputs together, in the order the action declares the inputs that
		// need them, with the output an issuance is derived from first within its asset — each
		// asset id is a statement about one of them. Which of them the transaction spends, not
		// in which order: `inputOrder` is the order, and it is not always this one.
		selected,
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
	| { issuances: PlannedIssuance[]; ok: true; reserved: { asset: string; utxo: SelectableUtxo }[] }
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
		/** The wallet's spendable outputs in one asset, which is where an issuing input comes from. */
		holdings: AssetHoldings;
		/** What the wallet established about each input, which the issued asset joins. */
		inputs: Record<string, Record<string, unknown>>;
		notes: NormalisationNote[];
		policyAsset: string;
		scope: ReferenceScope;
		spent: Map<string, { txid: string; vout: number }>;
	},
): ResolvedIssuances {
	const issuances: PlannedIssuance[] = [];
	const reserved: { asset: string; utxo: SelectableUtxo }[] = [];
	const policyAsset = context.policyAsset.trim().toLowerCase();
	const pools = new Map<string, SelectableUtxo[]>();

	/**
	 * The wallet's own outputs an issuing input may be derived from, in the order to take them.
	 *
	 * Per asset, because an issuing input is an input like any other: it carries the asset the
	 * action says it carries, and deriving an asset id from an output in a different one commits
	 * this transaction to spending an output that has no business in it.
	 *
	 * Smallest first in the asset the network charges its fees in — an issuance needs an output's
	 * identity rather than its value, so taking the smallest leaves the most behind to pay with.
	 * Largest first in any other asset, where the same input is usually also the one carrying
	 * that asset's amount, and where moving the issuance to a second output would mint a
	 * different asset. Neither honours an amount the input declares for itself; no wallet input's
	 * amount is honoured today, and that is recorded rather than hidden.
	 */
	const spareIn = (asset: string): SelectableUtxo[] => {
		const existing = pools.get(asset);

		if (existing) {
			return existing;
		}

		const ordered = context
			.holdings(asset)
			.filter((utxo) => utxo.spendable && !utxo.confidential)
			.toSorted((one, other) =>
				asset === policyAsset
					? toSats(one.amount) > toSats(other.amount)
						? 1
						: -1
					: toSats(other.amount) > toSats(one.amount)
						? 1
						: -1,
			);

		pools.set(asset, ordered);

		return ordered;
	};

	for (const entry of asArray(action.node.inputs)) {
		const declared = asRecord(entry);
		const issuance = declared && declaredIssuance(declared);

		if (!declared || !issuance) {
			continue;
		}

		const id = typeof declared.id === "string" ? declared.id : "(unnamed)";
		const onChain = context.spent.get(id);
		const asset = resolveAsset(declared.asset, `input ${id}`, {
			notes: context.notes,
			policyAsset: context.policyAsset,
			scope: context.scope,
		});

		if (!asset.ok) {
			return { ok: false, reason: asset.reason, reject: "foreign-asset" };
		}

		const funding = onChain ? undefined : spareIn(asset.id).shift();
		const outpoint = onChain ?? (funding && { txid: funding.txid, vout: funding.vout });

		if (!outpoint) {
			return {
				ok: false,
				reason:
					`Input ${id} issues an asset, which needs one of this wallet's own outputs in ` +
					`${asset.id} to derive it from, and there is none left to use.`,
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
			reserved.push({ asset: asset.id, utxo: funding });
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
