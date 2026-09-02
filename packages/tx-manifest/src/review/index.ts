import { baseUnits } from "../chain/baseUnits";
import type { ReadFeeRate, ReadTxOut } from "../chain/chainRead";
import { byOutpoint, outpointKey } from "../chain/outpoint";
import { type ConfirmationModel, confirmationModel, type ReviewedPlan } from "../confirmation";
import {
	type CompileCovenant,
	type ContractParamTypesOf,
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
import { resolveStaticWitnesses } from "../evaluation/witness";
import { estimateFeeSats } from "../fee";
import type { ParsedLiquidProcessCtParams } from "../request/request";
import { resolveActionRequirements } from "../request/requirements";
import { type AssetHoldings, fundAssets } from "./assetFunding";
import { type SelectableUtxo, toSats, withheldSentence } from "./coinSelection";

/**
 * What the wallet established for itself about one covenant this action touches.
 *
 * `verified` is the wallet's own finding, never the site's claim. A covenant the action creates
 * has nothing to compare against yet — its protection is that the destination is derived rather
 * than supplied — and says so rather than reporting a check it did not do.
 *
 * Every input the covenant was built from travels with it — the source text, the parameters, the
 * leaves and the build mode — rather than being left to be worked out again. Anything that goes
 * on to spend or pay this covenant compiles the contract a second time to satisfy it, and a
 * compile differing in any one of those produces a different script, which the covenant's own
 * execution rejects after a person has approved a transaction the wallet had already checked.
 * Resolving the request a second time would be a second answer to the same question, and nothing
 * downstream could tell the two apart.
 */
export type CovenantFinding = CovenantDerivation & {
	role: "created" | "spent";
	verified: "matches-chain" | "not-yet-on-chain";
};

/** One output of the transaction the wallet worked out, ready to be shown and then built. */
export type ReviewedOutput = {
	/**
	 * The asset this output pays in, as the chain writes the id.
	 *
	 * Carried rather than assumed, because a builder told only an amount pays it in whatever
	 * asset it defaults to. Every output this slice plans pays the network's own asset; the fact
	 * is still written down, because the builder is told it rather than left to guess.
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
	decidedBy: BlindingWord;
	id: string;
	/**
	 * The word this wallet set aside, present only on change it published over the format.
	 *
	 * Absent everywhere else, because everywhere else the wallet follows the format and has
	 * nothing to have overridden.
	 */
	overrode?: BlindingWord;
	sats: bigint;
	/** What the output actually pays to. Hex the builder decodes, never an address. */
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
 * An exact plan rather than a transaction: nothing here is a builder, a handle or an encoding,
 * and reading it moves nothing. What it settles is every decision the wallet gets to make —
 * which of its outputs pay, what each output pays and to which script, and at what rate — so
 * that whoever drives a builder from it adds what is written here and decides nothing further.
 *
 * Settled before the confirmation rather than after it deliberately: what a person is asked to
 * approve should be the plan that gets built, not a description of one that will be worked out
 * again afterwards from the same inputs and might not match.
 */
export type ManifestReview = {
	action: string;
	/**
	 * Whether the change this transaction returns hides what it carries.
	 *
	 * Change is an output like any other in the document's eyes, and the corpus declares one
	 * for almost every action while saying nothing about it — so the format's own answer is
	 * the network's default, and on Liquid that means hidden. This wallet publishes it
	 * instead, so the money returns in a form the next action can be funded from.
	 *
	 * Still derived rather than written as `false`, because anything checking what was built
	 * against what was decided and handed a constant checks nothing.
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
	/**
	 * The class this action is a method of, when the document declares it inside one.
	 *
	 * Carried because it is the difference between the two declaration shapes and it survives
	 * normalisation: a method reads the field values of one deployment of its class, and a free
	 * action reads none. Absent for an action declared at the top level.
	 */
	boundTo?: string;
	/**
	 * Everything the person is shown, with every value's origin attached.
	 *
	 * Built here rather than at the surface because this is where what the wallet established
	 * is known — a surface handed plain values would have to guess which of them were the
	 * site's word, and guessing is the failure the provenance exists to prevent.
	 */
	confirmation: ConfirmationModel;
	covenants: CovenantFinding[];
	/**
	 * The deployment this action brings into existence, when it creates one.
	 *
	 * Absent for every action that only spends what already exists. Present, it is the record of
	 * a contract that has no history yet: the wallet worked out each field, and every covenant
	 * this action creates was compiled from exactly these values.
	 *
	 * Reported rather than kept because the deployment outlives the transaction and half its
	 * fields are covenant script hashes — compiler output that nothing but a wallet can produce.
	 */
	createdInstance?: CreatedInstance;
	/**
	 * What the wallet worked out this will cost, from the shape of the transaction it planned.
	 *
	 * An estimate rather than the charged figure, and the two differ: the fee that is charged
	 * comes from the weight of the signed transaction, which does not exist until after the
	 * person agrees. The difference returns to them as change.
	 */
	estimatedFeeSats: bigint;
	/** What the wallet will pay, established from the chain rather than from the request. */
	feeRateSatsPerKvb: number;
	/**
	 * The assets this action creates, each with the output of the wallet's it is derived from.
	 *
	 * An asset id is a function of the output the issuing input spends, so the two are kept
	 * together: separated, nothing downstream could tell whether the id belongs to the output
	 * the transaction actually spends or to one considered and dropped.
	 */
	issuances: PlannedIssuance[];
	/**
	 * What this action does to the wallet's balance, one asset at a time.
	 *
	 * Worked out here because here is where what the covenants hold, what the outputs cost and
	 * what the wallet put in are all known at once. A surface handed the outputs alone would
	 * have to add up assets to reach a single number, which is a sum that cannot be written.
	 */
	movements: AssetMovement[];
	/** Legacy spellings the document used, so the generation it came from can be reported. */
	normalisation: NormalisationNote[];
	outputs: ReviewedOutput[];
	/**
	 * The asset the network charges its fees in, as the wallet was configured with it.
	 *
	 * Carried because the plan is not complete without it and because anything checking a
	 * finished transaction against this plan needs it: a fee output is the network's own, and
	 * "the fee is paid in whatever the fee output says" is not a check. Written in the
	 * canonical form the rest of this package compares asset ids in.
	 */
	policyAsset: string;
	protocol: string;
	/** The wallet's own outputs that fund this, chosen by the wallet. */
	selected: SelectableUtxo[];
};

/**
 * Why the wallet will not build this action: a sentence for a person, a name for a program.
 *
 * Both, always. A site handed only the sentence cannot tell a document it must rewrite from a
 * state file it must refresh, and a person handed only the name has been told nothing.
 */
export type ReviewRefusal = { reason: string; refused: true; reject: RejectToken };

export type ReviewManifestActionResult = ManifestReview | ReviewRefusal;

export function isRefusal(result: ReviewManifestActionResult): result is ReviewRefusal {
	return "refused" in result;
}

/**
 * Establishes what the wallet knows about an action before anyone is asked to approve it.
 *
 * For every covenant the action touches, the contract is rebuilt from the source the request
 * supplied; one being spent is then compared against what the chain says is at its outpoint, and
 * one being created is reported as derived-but-not-yet-on-chain rather than as verified.
 *
 * That distinction is the point. An action that creates a covenant has nothing to compare
 * against, and saying so is more honest than reporting a check that did not happen. Its
 * protection is different in kind: the destination is derived by the wallet rather than supplied
 * by the site.
 *
 * The order below is the whole of how a class method and a constructor differ. A method reads
 * the field values of the deployment it belongs to and derives its covenants from them. A
 * constructor has no deployment to read: it works one out — including the fields that are
 * covenant script hashes, which have to be compiled to be known — and then derives the covenants
 * it creates from what it worked out. Both end up deriving from an instance; only one of them
 * was handed it.
 *
 * Runs before the permission gate deliberately: a standing permission skips the prompt, so this
 * is the only thing between a request and a signature. Everything it cannot establish is a
 * refusal, and the refusal says which thing — a missing request part named by key, a contract
 * that will not compile, a value nobody supplied, a set of covenant hashes that never settle, a
 * state file listing no such covenant, a chain that cannot be read, a covenant that does not
 * match, an amount this runtime does not evaluate, a fee rate that could not be read, an account
 * that cannot cover it. There is no return value meaning "probably fine".
 */
export async function reviewManifestAction(
	request: ParsedLiquidProcessCtParams,
	input: {
		/**
		 * How the wallet names the account that is acting, in that wallet's own terms.
		 *
		 * Supplied rather than derived, because which account is acting is the caller's fact and
		 * this package holds no keys and no accounts. It is shown because it is otherwise the one
		 * thing on the screen nobody stated: the wallet chose it by choosing the outputs.
		 */
		accountLabel: string;
		compile: CompileCovenant;
		/**
		 * The version of SimplicityHL standing behind `compile`, when the caller knows it.
		 *
		 * Optional because this package compiles nothing itself and cannot ask. A caller that
		 * supplies one has the document's own declared version checked against it; a caller that
		 * does not gets the check skipped rather than answered against a stand-in, because
		 * passing a placeholder would turn "not checked" into "checked and fine".
		 */
		compilerVersion?: string;
		/**
		 * What a contract declares about its own compile parameters.
		 *
		 * Optional because a document that wires every parameter to a name needs nothing from it.
		 * A document that writes one as a bare value and has no reader here is refused rather than
		 * built at a width nobody stated.
		 */
		contractParamTypes?: ContractParamTypesOf;
		/** The wallet's spendable outputs in the asset the network charges its fees in. */
		fundingUtxos: SelectableUtxo[];
		/**
		 * The wallet's spendable outputs in any other asset, asked for by id.
		 *
		 * Optional and asked lazily, because which assets an action moves cannot be known
		 * before the document has been read: a caller cannot be expected to hand over a
		 * balance for every asset that exists. A caller supplying none holds nothing in any
		 * other asset, which comes out as a shortfall naming the asset rather than as silence.
		 */
		holdingsOf?: AssetHoldings;
		network: string;
		/** The asset the network charges its fees in, which is the only asset that pays them. */
		policyAsset: string;
		readFeeRate: ReadFeeRate;
		readTxOut: ReadTxOut;
		/**
		 * The same compiler again, for the covenant hashes a document works out for itself.
		 *
		 * Separate from `compile` because a hash needs no address and no network, and because it
		 * is called inside a fixed point that must not be asynchronous — the number of rounds a
		 * document takes to settle is a fact about the document, not about scheduling.
		 */
		scriptPubKeyOf: CompileScriptPubKey;
		/** Where the wallet's own share of an action is paid, as a script rather than an address. */
		walletScriptPubKeyHex: string;
	},
): Promise<ReviewManifestActionResult> {
	const normalised = normaliseManifest(request.manifest);
	const manifest = normalised.manifest;
	const deployment = normaliseInstance(request.instance);
	const notes: NormalisationNote[] = [...normalised.notes, ...deployment.notes];

	// Everything the wallet will not build, before it builds anything. A construct in a
	// load-bearing position that this runtime does not act on is refused here rather than
	// stepped over: the format's own conformance rule is that a tool which does not implement
	// an extension rejects a manifest using its fields, and a document read only in part is a
	// document nobody can say what signing would do.
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

	// The mode this protocol says its contracts were built in, before anything is compiled. It
	// changes the commitment root and therefore both every covenant address and every covenant
	// hash the document computes, so a statement that cannot be read is a refusal rather than a
	// default: building the other way derives a well-formed address for a different contract.
	const buildMode = manifest.buildMode;

	if (!buildMode.ok) {
		return { reason: buildMode.reason, refused: true, reject: "unreadable-build-mode" };
	}

	// What the protocol already knows the answer to is filled before anything asks whether the
	// request is complete. The other order reports a parameter as missing that the document
	// itself supplies, which sends a site looking for a value it was never meant to send.
	const filled = fillParameters(
		action,
		request.params,
		{ instance: deployment.instance.fields, params: request.params },
		notes,
	);

	if (!filled.ok) {
		return { reason: filled.reason, refused: true, reject: filled.reject };
	}

	// A container the document declares and writes in a shape nothing here can read. Every one
	// of these keys is one the runtime acts on, so the reading that used to apply — a value that
	// is not the expected shape is the same as no value — turned a malformed declaration into an
	// absent one: an action whose `validations` are an object rather than a list had no rules
	// checked, and nothing said so.
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

	/**
	 * The wallet's own outputs in one asset, whichever asset an action turns out to move.
	 *
	 * The network's own asset comes from the list the caller always supplies; every other one
	 * is asked for by id. Asked once per asset and kept, because a wallet answering from its
	 * own snapshot builds the list fresh each time — so asking twice yields two lists of equal
	 * outputs that share no identity, and an output already committed to for an issuance would
	 * be offered again as though it were a different one.
	 */
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

	/**
	 * What a name means while this action is being read.
	 *
	 * The deployment's fields as they arrived, which is all a method ever has and all a
	 * constructor starts with. The constructor's own fields are folded in below, once they have
	 * been worked out.
	 */
	/**
	 * What the wallet established about each named input, for the names that read one.
	 *
	 * Written as each input resolves rather than gathered afterwards: an input's asset and
	 * amount are things the wallet read from the chain or derived for itself, and a later
	 * reference to `payout_in.asset` means whichever of those it turned out to be.
	 */
	const inputs: Record<string, Record<string, unknown>> = {};
	/**
	 * What this transaction already brings, before the wallet spends anything of its own.
	 *
	 * Only what a spent covenant explicitly holds, and a covenant whose holding could not be
	 * established never reaches here: the action is refused where it is read.
	 */
	const chainHeld: HeldValue[] = [];
	let scope: ReferenceScope = {
		inputs,
		instance: deployment.instance.fields,
		params,
	};

	// The covenants this action spends, which are the ones there is something on chain to compare
	// against. They are derived first because a spent covenant is named by an input and a created
	// one by an output, so the declared order already puts every spent site first — and because
	// nothing a constructor works out can change what an existing deployment is locked by.
	for (const site of covenantSites(action.node).filter((declared) => declared.role === "spent")) {
		// Sequential on purpose, and the rule is disabled here rather than obeyed. This loop
		// returns on the first site it refuses, so running the sites concurrently would compile
		// contracts and send chain reads for covenants after the answer is already known, and would
		// make which refusal a person is shown depend on which request finished first instead of on
		// the order the manifest declares.
		// oxlint-disable-next-line no-await-in-loop
		const derived = await deriveCovenantAddress(manifest, {
			compile: input.compile,
			...(input.contractParamTypes === undefined
				? {}
				: { contractParamTypes: input.contractParamTypes }),
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
			// Same loop, same reason: the first refusal is the answer, so nothing after it is worth
			// reading.
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

		/**
		 * What the covenant holds, which is the chain's word rather than the document's.
		 *
		 * Both halves or neither. An action spending a covenant that already holds part of what
		 * its outputs cost needs the wallet to find only the rest, and that subtraction is the
		 * only reason this figure is read at all — so a covenant whose amount or asset the
		 * wallet could not establish is refused rather than treated as holding nothing.
		 *
		 * Treating it as zero is the failure this replaces, and it is not a conservative one.
		 * The wallet would fund every output in full out of its own money, the covenant's real
		 * balance would arrive in the transaction unaccounted for, and the whole of it would
		 * fall into the change the signing module appends — an unknown balance swept somewhere
		 * nobody was shown, off the back of a plan that called itself settled.
		 *
		 * On this network a covenant output cannot be confidential and still work: a Simplicity
		 * program reads exact amounts and asset ids through jets that cannot introspect a
		 * commitment. So this is either an output no contract could have spent, or a chain
		 * reader that does not report what it holds — and the refusal says which of those the
		 * wallet can tell, which is that it was not told.
		 */
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

		// Named, or the holding has nowhere to be attributed to. A covenant input the document
		// gives no id cannot be subtracted from any asset's cost — the ledger keys what the
		// transaction brings by the input that brings it — and dropping it silently is the same
		// arithmetic mistake as reading it as zero.
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

		// Recorded beside the amount because an input's own name reads the asset as
		// `<input>.asset`, and a name that could not see it would resolve to nothing.
		// Parsed once, and parsed rather than trusted. The reader is the wallet's own and what
		// it returns is text: an empty string converts to zero, a hexadecimal one to a number in
		// a base nobody meant, and a fraction throws — out of a function whose whole contract is
		// to answer with a refusal. All three are the same failure, and all three are a covenant
		// whose holding this wallet has not established.
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

		covenants.push({ ...derived.derivation, role: "spent", verified: "matches-chain" });
	}

	// An asset an action creates is derived from the output its issuing input spends, so that
	// output is settled here rather than at the funding below: an input's own name reads the
	// asset as soon as the input resolves, and an id derived from an output the wallet had not
	// yet committed to spending would be an id for an asset that never comes to exist.
	const issued = resolveIssuances(action, {
		holdings,
		inputs,
		notes,
		policyAsset: input.policyAsset,
		scope,
	});

	if (!issued.ok) {
		return { reason: issued.reason, refused: true, reject: issued.reject };
	}

	// Hooks run after every input is resolved and before anything is built, which is what makes
	// them able to say what an input turned out to hold. An input's own hook goes first and in
	// declaration order, then the action's, because a document's later line may read what an
	// earlier one set — and every output amount and validation below reads the result.
	const hooked = runActionHooks(action, scope, notes);

	if (!hooked.ok) {
		return { reason: hooked.reason, refused: true, reject: "document-fault" };
	}

	scope = hooked.scope;

	// The deployment this action creates, worked out before anything is derived from it. Its
	// covenant-hash fields are compiled here rather than asked for, because nothing but a wallet
	// can produce one — and they are worked out together rather than in an order, because one may
	// name another and the format offers no way to say which comes first.
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

	// The covenants this action creates, derived once the deployment they are compiled with is
	// complete. There is nothing on chain to compare them against — that is what creating one
	// means — so the wallet reports what it derived and that it derived it, which is a different
	// fact from a check that passed rather than a weaker one.
	for (const site of covenantSites(action.node).filter((declared) => declared.role === "created")) {
		// Sequential for the same reason the loop above is: the first refusal is the answer.
		// oxlint-disable-next-line no-await-in-loop
		const derived = await deriveCovenantAddress(manifest, {
			compile: input.compile,
			...(input.contractParamTypes === undefined
				? {}
				: { contractParamTypes: input.contractParamTypes }),
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

		covenants.push({ ...derived.derivation, role: "created", verified: "not-yet-on-chain" });
	}

	// A value the document states for a witness outright, resolved after the hooks: a protocol
	// may select a contract's branch by a field of its own deployment, and a hook is what may
	// have written that field. Nothing here signs anything — the literal and its type travel to
	// the compiler as text — but a value that will not resolve is a branch nobody chose.
	const stated = resolveStaticWitnesses(action, scope, notes);

	if (!stated.ok) {
		return { reason: stated.reason, refused: true, reject: "document-fault" };
	}

	const plan = planAction(action, scope, notes, manifest.raw.confidential_outputs);

	if (!plan.ok) {
		return { reason: plan.reason, refused: true, reject: "document-fault" };
	}

	// The protocol's own rules about this action, checked once its amounts are known: a rule
	// comparing an amount cannot be checked before there is one. A rule that fails refuses, and
	// so does one this runtime cannot read — reading half a rule permits exactly what it was
	// written to prevent.
	const failed = checkValidations(action, scope, notes);

	if (failed) {
		return { reason: failed.reason, refused: true, reject: "document-fault" };
	}

	// What the action requires of each input beyond where the money comes from: a relative
	// timelock a covenant may depend on, and an address it may pin funding to.
	const inputRules = resolveInputRules(action, scope, notes);

	if (!inputRules.ok) {
		return { reason: inputRules.reason, refused: true, reject: "document-fault" };
	}

	// The signing module takes one sequence for the transaction and writes it onto every input
	// that declares none, so what the action declares per input has to collapse to a single
	// value or be refused here. What survives is a sequence with the timelock disable bit set,
	// which constrains no input at all — so honouring it is nothing the builder has to be told,
	// and a declaration this wallet cannot carry is refused before the person is asked.
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

	// A reader that returns rather than throws has still not necessarily answered. `NaN` is
	// what a failed parse of an endpoint's reply comes back as, an infinity is what dividing by
	// a zero estimate produces, and a negative rate is a number no network charges. Each of
	// them reaches the same place — the headroom this over-selects by, which converts the rate
	// to a whole number of base units — and converting any of them throws out of this function
	// entirely, so a caller promised a refusal gets an exception instead.
	//
	// Zero is allowed and is not in that set. A regtest node with no traffic really does answer
	// zero, the arithmetic below is sound at zero, and what it produces is a transaction that
	// over-selects by nothing — which the signing module then charges its own fee against out
	// of what was selected for the outputs. That is a shortfall if it does not fit, named as
	// one, rather than a refusal for a rate the network genuinely quoted.
	if (!Number.isFinite(feeRateSatsPerKvb) || feeRateSatsPerKvb < 0) {
		return {
			reason:
				`The wallet was given ${feeRateSatsPerKvb} as a fee rate, which is not a rate anything ` +
				"can be charged at. It will not build a transaction it cannot price.",
			refused: true,
			reject: "no-fee-rate",
		};
	}

	// Read as a statement about several assets rather than about one amount. A single running
	// total is only sound while there is a single asset: added together, three units of a
	// one-of-a-kind token and three thousand base units of money make six of nothing, and a
	// wallet that funds six of nothing funds neither.
	const reckoned = assetLedger(action, plan.plan.outputs, {
		held: [
			...chainHeld,
			// An issuance creates its units out of nothing, so the transaction brings them
			// rather than the wallet finding them. Left out, the wallet would go looking for an
			// asset that does not exist yet and refuse the action for holding none of it.
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

	/**
	 * The change output the signing module appends for itself.
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
	 * one of them saying nothing.
	 */
	const changeOverrode: BlindingWord | undefined =
		networkChange.length === 0 ? "chain" : networkChange[0]?.blinding.overrode;

	// An output the document wants hidden is hidden with a blinding key of the address it pays
	// to. That holds for this wallet's own outputs and for its change, and not for an address
	// the document names — there the key belongs to whoever owns that address, and this wallet
	// has no way to obtain it. Refused here rather than built open, which would publish an
	// amount the protocol asked to keep.
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

	// Each asset funded out of what the wallet holds in that asset, and short in one of them is
	// a refusal that says which one. The fee is added to the network's own asset and to no
	// other: a second asset never becomes a second fee.
	/**
	 * Which script each declared input must be funded from, where the action pins one.
	 *
	 * A script rather than an address, on both sides. The document's `from_address` resolves
	 * through the request or the deployment to whatever those carry, and what the wallet's own
	 * outputs carry is `scriptPubKeyHex` — so this compares hex against hex and decodes nothing.
	 * Nothing in this package holds a bech32 reader, so a deployment recording a bech32 address
	 * where the wallet records a script is two strings that do not match, and the action is
	 * refused rather than funded from somewhere the protocol did not name.
	 */
	const pinFor = new Map<string, string>();

	for (const rule of inputRules.rules) {
		if (rule.fromAddress !== undefined) {
			pinFor.set(rule.id, rule.fromAddress);
		}
	}

	/** Every declared input the wallet funds out of its own outputs, and in which asset. */
	const fundedInput = new Map(ledger.walletInputs.map((wallet) => [wallet.id, wallet.asset]));

	// A pin on an input the wallet funds nothing for — a covenant input, whose output the state
	// file names and the chain confirmed — is a requirement about a choice this wallet does not
	// make. It is refused rather than passed over, because passing over a pin is exactly how an
	// action gets funded from somewhere its protocol ruled out.
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

	/**
	 * The pin that applies to each asset, which is the unit funding is actually chosen in.
	 *
	 * One selection is made per asset and credited to the declared inputs in it, so a pin on any
	 * one of them constrains the whole of that asset's run — there is no smaller thing to
	 * constrain. That is why two inputs in one asset pinned to different scripts is refused
	 * rather than reconciled: both cannot be honoured, and honouring either silently is the
	 * wallet choosing which half of the document to believe.
	 *
	 * An asset nothing pins is left alone. Filtering every asset by the first pin found is what
	 * this replaces, and it constrained inputs the document said nothing about — an action
	 * pinning its collateral would refuse for holding no fee money at the collateral's address.
	 */
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

	// Said here rather than left to the shortfall, because they are different sentences: "you
	// hold nothing in this asset" and "you hold nothing in this asset *there*" send a person to
	// two different places. Only the assets that are actually pinned are checked, and each names
	// its own.
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

	// An output committed to for an issuance was chosen before the action's pins could be
	// resolved, because the asset id depends on that output and the hooks that read the id run
	// first. Where the two disagree the action is refused rather than built from another output:
	// moving the issuance would mint a different asset than the one already computed.
	//
	// Only against the pin on the input that issued it. An issuance on an input the document
	// pins nothing for is not misplaced by a pin somewhere else in the same action.
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
		// The fee has no figure until the transaction has been weighed, which is after this. So
		// the network's asset is over-selected by a kilo-vbyte at the chosen rate — enough for a
		// transaction of this size with room to spare — and whatever is left comes back as
		// change. No other asset carries any of it.
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

	// Keyed by the script rather than by the address. They are two spellings of one fact, and
	// only one of them is hex: a builder hex-decodes every output script it is given, so handing
	// it a bech32 address fails inside the module with an error naming neither the output nor
	// what was wrong with it.
	const covenantScripts = new Map(
		covenants.map((found) => [found.utxoType, found.scriptPubKeyHex]),
	);
	const outputs: ReviewedOutput[] = [];
	/** Where each declared output lands, which is not its declared position once one is dropped. */
	const outputAt = new Map<string, number>();
	/**
	 * What each asset's outputs pay back to this wallet, which its balance change adds back.
	 *
	 * An output the action declares is counted as paid out by the ledger whoever it pays, so one
	 * paying this wallet has to be added again or the balance reads as a loss the wallet never
	 * took. Change is not among them: change is already the difference between the two.
	 */
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

		// A covenant output pays the script the wallet derived, never one the request supplied.
		// There is no path from a site-supplied address to a transaction output. An op_return
		// pays to the bytes the plan encoded: those bytes are the output, and paying it to the
		// wallet instead would drop what the protocol published.
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

	// The wallet's own outputs, one asset's worth at a time, in the order the action declares
	// the inputs that need them — with the output an issuance was derived from first within its
	// asset, because funding put it there and moving it would mint a different asset.
	const fundedOrder = [
		...new Set([
			...ledger.walletInputs.map((wallet) => wallet.asset),
			...funding.funded.map((entry) => entry.asset),
		]),
	];
	/** Which declared input was credited with each asset's whole selection. */
	const creditedWith = new Map<string, string>();
	/** A declared input built out of the selection an earlier declaration was credited with. */
	const fundedWith = new Map<string, string>();
	/** Which of the chosen outputs build each declared input, in the order they were chosen. */
	const walletRuns = new Map<string, SelectableUtxo[]>();

	for (const wallet of ledger.walletInputs) {
		const credited = creditedWith.get(wallet.asset);

		// Two declared inputs in one asset are funded out of one selection, and nothing in the
		// document says which of the chosen outputs belongs to which of them. The first is
		// credited with the whole selection; the second is told it lands where that run ends,
		// which is the honest answer to a question the document did not answer.
		if (credited !== undefined) {
			fundedWith.set(wallet.id, credited);

			continue;
		}

		creditedWith.set(wallet.asset, wallet.id);
		walletRuns.set(wallet.id, fundedFor.get(wallet.asset)?.selected ?? []);
	}

	/**
	 * Every run of chosen outputs, in the order the action's declarations reach them.
	 *
	 * Walked by asset rather than by declaration so that an action stating no position at all
	 * lays its inputs out exactly as it did before positions were read: the assets an input
	 * declares first, then the ones only the fee needed. An asset no input declares — which is
	 * where an undeclared fee is paid — is a run with no name and no stated place.
	 */
	const declaredInputs = asArray(action.node.inputs).map((entry) => asRecord(entry));
	const statedIndexOf = (id: string): number | undefined => {
		const declared = declaredInputs.find((entry) => entry?.id === id);

		return statedIndex(declared?.required_index) ?? undefined;
	};
	const placeable: PlaceableInput<SelectableUtxo>[] = [];

	for (const asset of fundedOrder) {
		const id = creditedWith.get(asset);
		const wanted = id === undefined ? undefined : statedIndexOf(id);
		const entry: PlaceableInput<SelectableUtxo> = {
			slots: (id === undefined ? fundedFor.get(asset)?.selected : walletRuns.get(id)) ?? [],
		};

		if (id !== undefined) {
			entry.id = id;
		}

		if (wanted !== undefined) {
			entry.stated = wanted;
		}

		placeable.push(entry);
	}
	const placement = placeInputs(placeable);
	/**
	 * Where a declared input landed, which is not always anywhere.
	 *
	 * One funded out of an earlier declaration's selection lands where that run ends, and one
	 * the wallet builds nothing for — a covenant input, which this slice does not build — lands
	 * nowhere at all rather than at a number that reads like a place.
	 */
	const landedAt = (id: string): number | undefined => {
		const own = placement.at.get(id);

		if (own !== undefined) {
			return own;
		}

		const credited = fundedWith.get(id);
		const start = credited === undefined ? undefined : placement.at.get(credited);

		return start === undefined ? undefined : start + (walletRuns.get(credited ?? "")?.length ?? 0);
	};

	// Where each piece actually lands, against where the document says it must. The inputs were
	// laid out above in the order the document states, and the declared outputs are built in
	// order with the network's change last — so the layout is known here, and a piece that could
	// not land where it was asked to is refused by name rather than built somewhere else.
	const positions: StatedPosition[] = [];

	for (const declared of declaredInputs) {
		if (!declared || declared.required_index === undefined) {
			continue;
		}

		const id = typeof declared.id === "string" ? declared.id : "(unnamed)";
		const wanted = statedIndex(declared.required_index);

		// A position written as anything but a whole number is a requirement this wallet cannot
		// read, and the old reading — anything that is not a number means no requirement — is
		// the silent one: the covenant that reads that index still reads it, and the network
		// rejects the transaction after a person has approved it.
		if (wanted === undefined) {
			return {
				reason: `Input ${id} states a position of ${JSON.stringify(declared.required_index)}, which is not a place in a transaction.`,
				refused: true,
				reject: "unbuildable-position",
			};
		}

		positions.push({
			// An input the wallet builds nothing for is counted one past the end, which no stated
			// position can equal: it has no place, and being refused by name is what says so.
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

		// An output the document gives no id cannot be found among the ones the wallet built —
		// they are matched by the id the plan carries — so there is nothing to check the
		// position against, and passing over it would be honouring the requirement by not
		// looking at it.
		if (id === undefined) {
			return {
				reason:
					`This action states a position for an output the manifest gives no id, so this ` +
					"wallet cannot say which output it is or where it landed.",
				refused: true,
				reject: "unbuildable-position",
			};
		}

		// The network's change is appended by the module after everything else, so a document
		// stating a position for it is stating one the wallet could only meet by accident. An
		// output the wallet dropped for paying nothing is counted where it would have been.
		positions.push({ at: outputAt.get(id) ?? outputs.length, id, kind: "output", stated: wanted });
	}

	const positioned = checkPositions(positions, {
		inputs: placement.order.length,
		outputs: outputs.length + Math.min(networkChange.length, 1),
	});

	if (!positioned.ok) {
		return { reason: positioned.reason, refused: true, reject: "unbuildable-position" };
	}

	const selected = placement.order;

	/**
	 * What a transaction of this shape costs at the rate the chain quoted.
	 *
	 * Worked out from the shape that was actually planned rather than from a draft of one. The
	 * reference implementation plans twice — once against a fee of zero to learn the shape, then
	 * against what that shape costs — because an amount there may be written as a function of the
	 * fee. Nothing in this runtime can be: an expression naming the fee is refused where it is
	 * evaluated, so the shape does not depend on the figure and one pass settles both.
	 *
	 * An estimate, and it is not what gets charged. The signing module does not estimate — it
	 * signs and weighs the result — so before approval there is a model and after it a
	 * measurement. The difference returns to the person as change, which is why the model
	 * over-states rather than under-states.
	 */
	const estimatedFeeSats = estimateFeeSats(
		{
			covenantInputs: covenants.filter((found) => found.role === "spent").length,
			// A surcharge on an input already counted rather than an input of its own: an
			// issuance sits on one, and the outputs it derives from were committed to above.
			issuingInputs: issued.issuances.length,
			outputs: outputs.length,
			walletInputs: selected.length,
		},
		feeRateSatsPerKvb,
	);

	// What each asset does to this wallet's balance: what the transaction brings in it, less
	// what the action pays out of it, plus what comes back — and the fee, in the one asset the
	// network charges it in. Change is not added: it is already the difference between the two.
	const movements: AssetMovement[] = ledger.entries.map((entry) => ({
		asset: entry.asset,
		sats:
			entry.held -
			entry.needed +
			(returned.get(entry.asset) ?? 0n) -
			(entry.asset === policyAsset ? estimatedFeeSats : 0n),
	}));

	const reviewed: ReviewedPlan = {
		action: request.action,
		...(action.boundTo === undefined ? {} : { boundTo: action.boundTo }),
		changeBlinded,
		...(changeOverrode === undefined ? {} : { changeOverrode }),
		covenants,
		...(created === undefined ? {} : { createdInstance: created.instance }),
		estimatedFeeSats,
		feeRateSatsPerKvb,
		issuances: issued.issuances,
		movements,
		normalisation: notes,
		outputs,
		policyAsset,
		protocol: manifest.protocol ?? "",
		selected,
	};

	// The model is a reading of everything above, so it is derived from the finished plan rather
	// than written beside it. The plan is complete without it and never carries a stand-in for
	// it: there is no moment where a `ManifestReview` exists holding a confirmation nobody built.
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
			/**
			 * The outputs committed to for an issuance, each with the input it was reserved for.
			 *
			 * The input's own id travels with it because a pin belongs to one declared input
			 * rather than to the asset it happens to be in: checking every reserved output against
			 * every pin would refuse an issuance the document said nothing about.
			 */
			reserved: { asset: string; inputId: string; utxo: SelectableUtxo }[];
	  }
	| { ok: false; reason: string; reject: RejectToken };

/**
 * Works out every asset this action creates, and which output each one is derived from.
 *
 * An input the wallet funds has no outpoint until the wallet picks one, and this is where it
 * gets one — the asset id is a function of that output, so choosing it later would mean
 * deriving an id for an output the transaction might not spend.
 *
 * The chosen output is returned as reserved rather than merely noted. Everything after this
 * treats the funding pool as what is left, because an output spent twice is not a transaction,
 * and an issuance derived from one the wallet then declined to spend is worse: it is a
 * well-formed id for an asset that would never exist.
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
	},
): ResolvedIssuances {
	const issuances: PlannedIssuance[] = [];
	const reserved: { asset: string; inputId: string; utxo: SelectableUtxo }[] = [];
	const policyAsset = context.policyAsset.trim().toLowerCase();
	const pools = new Map<string, SelectableUtxo[]>();
	/**
	 * Every output already reserved, across every asset and every issuance.
	 *
	 * One set for all of them, because two issuances reserving one output would derive two
	 * different assets from it and then ask the transaction to spend it twice to create both.
	 * A per-pool set would not see it: the same output can be offered under two assets, and
	 * the same output can be described by two objects inside one.
	 */
	const taken = new Set<string>();

	/**
	 * The wallet's own outputs an issuing input may be derived from, in the order to take them.
	 *
	 * Per asset, because an issuing input is an input like any other: it carries the asset the
	 * action says it carries, and deriving an asset id from an output in a different one commits
	 * this transaction to spending an output that has no business in it.
	 *
	 * Smallest first in the asset the network charges its fees in — an issuance needs an
	 * output's identity rather than its value, so taking the smallest leaves the most behind to
	 * pay with. Largest first in any other asset, where the same input is usually also the one
	 * carrying that asset's amount, and where moving the issuance to a second output would mint
	 * a different asset.
	 */
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

	/**
	 * The next output in this asset that nothing has reserved yet, if there is one.
	 *
	 * Confidential ones are stepped over rather than filtered away, so that running out of
	 * usable outputs and running out of outputs altogether stay distinguishable — the two are
	 * different things to tell a person, and only one of them is about their balance.
	 */
	const spareIn = (asset: string): SelectableUtxo | undefined =>
		candidatesIn(asset).find((utxo) => !utxo.confidential && !taken.has(outpointKey(utxo)));

	for (const entry of asArray(action.node.inputs)) {
		const declared = asRecord(entry);
		const issuance = declared && declaredIssuance(declared);

		if (!declared || !issuance) {
			continue;
		}

		const id = typeof declared.id === "string" ? declared.id : "(unnamed)";

		// A covenant can issue an asset too, on the input that spends it, and the module has a
		// separate call for it. Satisfying a covenant input is not something this wallet can do
		// yet at all, so an issuance sitting on one is refused by name rather than derived from
		// an outpoint that would then be added as an ordinary input.
		if (typeof asRecord(declared.utxo_source)?.utxo_type === "string") {
			return {
				ok: false,
				reason:
					`Input ${id} issues an asset from a covenant this wallet spends, and this wallet ` +
					"cannot yet satisfy a covenant input.",
				reject: "unimplemented-construct",
			};
		}

		const asset = resolveAsset(declared.asset, `input ${id}`, {
			notes: context.notes,
			policyAsset: context.policyAsset,
			scope: context.scope,
		});

		if (!asset.ok) {
			return { ok: false, reason: asset.reason, reject: "foreign-asset" };
		}

		const funding = spareIn(asset.id);

		if (!funding) {
			// What is there and cannot be used is said here as well as at funding. A person
			// whose only spare output is confidential is not short of outputs — they are being
			// told that this path cannot spend the one they can see, which is a different
			// sentence and the only one that tells them what to do about it.
			const withheld = candidatesIn(asset.id).filter(
				(utxo) => utxo.confidential && !taken.has(outpointKey(utxo)),
			);

			return {
				ok: false,
				reason:
					`Input ${id} issues an asset, which needs one of this wallet's own outputs in ` +
					`${asset.id} to derive it from, and there is none left to use.` +
					withheldSentence(withheld),
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
		// The issued asset and its reissuance token, under the input's own name. An input's
		// `asset` is what it creates rather than what the output it spends held, which is the
		// whole reason a protocol writes the name at all.
		context.inputs[id] = { ...context.inputs[id], ...issuanceAttributes(resolved.issuance) };
	}

	return { issuances, ok: true, reserved };
}

/** Confirmation target for the fee estimate, in blocks. */
const FEE_TARGET_BLOCKS = 6;

/**
 * What to over-select by so the finished transaction can pay its own fee.
 *
 * The real fee comes from the assembled transaction's weight, which does not exist until after
 * selection. A small transaction is on the order of a kilo-vbyte, so one kvb at the chosen rate
 * covers it with room to spare, and whatever is left over comes back as change.
 */
function feeHeadroomSats(feeRateSatsPerKvb: number): bigint {
	return BigInt(Math.ceil(feeRateSatsPerKvb));
}

/**
 * Where the state file says this deployment's covenant of that type sits.
 *
 * The state file carries an outpoint and no script: what is at an outpoint is read from the chain
 * rather than told by whoever asked, which is the whole reason the comparison means anything.
 */
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

/**
 * Largest first, or smallest first, and equal amounts in the order the wallet listed them.
 *
 * Returning 0 for a tie is what makes that last part true. A comparator answering -1 to both
 * "a before b" and "b before a" contradicts itself, and a sort is free to act on either
 * answer — so two outputs of the same size could come out in either order, and which of them
 * an issuance derived its asset from would depend on the engine rather than on anything the
 * wallet decided. The same request has to mint the same asset twice.
 */
function bySize(left: bigint, right: bigint, smallestFirst: boolean): number {
	if (left === right) {
		return 0;
	}

	return left > right === smallestFirst ? 1 : -1;
}

type HookedScope = { ok: false; reason: string } | { ok: true; scope: ReferenceScope };

/**
 * Runs every hook this action declares, in the order the format states they run in.
 *
 * Each input's own hook first and in declaration order, then the action's — and each against a
 * scope already carrying everything set before it, because the format says a later assignment
 * may read an earlier one's result. Folding them together against one frozen scope would
 * silently produce a different transaction for a document that reads its own earlier line.
 */
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

		// A hook the document declares and this runtime cannot read is refused rather than
		// skipped. Skipping it is the silent failure: every amount and every rule below reads
		// the scope this was supposed to write into, and they resolve against the wrong values
		// without anything having gone visibly wrong.
		if (hook.kind === "malformed") {
			return { ok: false, reason: `Input ${id}: ${hook.reason}` };
		}

		if (hook.kind === "absent") {
			continue;
		}

		// Inside `on_resolved`, `asset` and `reissuance_token` name this input rather than
		// something else in scope: the input writing them is the input being resolved.
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

/**
 * Two spellings of one locking script are one locking script.
 *
 * Hex on both sides and compared as bytes: a script is a run of bytes and the case it is
 * written in is not part of which script it is. Nothing is decoded here — see the pin map above
 * for why an address and a script are simply two strings that do not match.
 */
function sameScript(one: string, other: string): boolean {
	return one.trim().toLowerCase() === other.trim().toLowerCase();
}

/**
 * A stated position, or nothing where what was written is not one.
 *
 * Whole and finite, and negative only in the sense the format means by it — counting from the
 * end. `1.5` is not a place a transaction has, `NaN` is not a place at all, and a number beyond
 * what can be counted exactly is a position nothing could land at. Each of them used to read as
 * "this output states no position", which is the one answer none of them gives.
 */
function statedIndex(declared: unknown): number | undefined {
	return typeof declared === "number" && Number.isSafeInteger(declared) ? declared : undefined;
}

/**
 * The first container this action declares in a shape this runtime cannot read.
 *
 * Every key checked here is one the construct table marks as acted on, and each is read
 * through a helper that answers "not the shape I wanted" and "not there" with the same value.
 * That is the right answer for a document that says nothing and the wrong one for a document
 * that says something unreadable: the second has declarations — rules to check, inputs to
 * build, a witness to fill — and passing over them is honouring them by not looking.
 *
 * Shapes only. What each container says is read where it is read, and refuses there.
 */
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

		// A witness block nothing can read is a spend nobody can satisfy, and the refusal
		// surface that checks which witnesses this wallet can produce would see none of them.
		if (input.witnesses !== undefined && !asRecord(input.witnesses)) {
			return `Input ${id} declares witnesses this wallet cannot read.`;
		}

		// An issuance block nothing can read is an input that stops being an issuing input:
		// the asset it was to create is never derived, and its own name resolves to nothing.
		if (input.issuance !== undefined && !asRecord(input.issuance)) {
			return `Input ${id} declares an issuance this wallet cannot read.`;
		}
	}

	return undefined;
}
