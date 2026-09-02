import type { ReadFeeRate, ReadTxOut } from "../chain/chainRead";
import { byOutpoint, outpointKey } from "../chain/outpoint";
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
import { covenantSites } from "../document/sites";
import { assetLedger, type HeldValue, resolveAsset } from "../evaluation/assetLedger";
import type { BlindingWord } from "../evaluation/blinding";
import {
	declaredIssuance,
	issuanceAttributes,
	type PlannedIssuance,
	resolveIssuance,
} from "../evaluation/issuance";
import { planAction } from "../evaluation/plan";
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
	/** Legacy spellings the document used, so the generation it came from can be reported. */
	normalisation: NormalisationNote[];
	outputs: ReviewedOutput[];
	protocol: string;
	/** The wallet's own outputs that fund this, chosen by the wallet. */
	selected: SelectableUtxo[];
};

export type ReviewRefusal = { reason: string; refused: true };

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
		compile: CompileCovenant;
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

	const action = findAction(manifest, request.action);

	if (!action) {
		return { reason: `The manifest declares no action named "${request.action}".`, refused: true };
	}

	// The mode this protocol says its contracts were built in, before anything is compiled. It
	// changes the commitment root and therefore both every covenant address and every covenant
	// hash the document computes, so a statement that cannot be read is a refusal rather than a
	// default: building the other way derives a well-formed address for a different contract.
	const buildMode = manifest.buildMode;

	if (!buildMode.ok) {
		return { reason: buildMode.reason, refused: true };
	}

	const requirements = resolveActionRequirements(request, manifest, action);

	if (requirements.missing.length > 0) {
		const named = requirements.missing
			.map((entry) => (entry.keys ? `${entry.reason} (${entry.keys.join(", ")})` : entry.reason))
			.join(" ");

		return { reason: `This request cannot be built. ${named}`, refused: true };
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
		params: request.params,
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
			return { reason: derived.reason, refused: true };
		}

		const outpoint = stateOutpoint(request, site.utxoType);

		if (!outpoint) {
			return { reason: `The state file lists no ${site.utxoType} to spend.`, refused: true };
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
			};
		}

		const matched = covenantMatchesChain(derived.derivation, onChain.scriptPubKeyHex);

		if (!matched.matched) {
			return { reason: matched.reason, refused: true };
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
			};
		}

		// Recorded beside the amount because an input's own name reads the asset as
		// `<input>.asset`, and a name that could not see it would resolve to nothing.
		inputs[site.id] = { amount_sat: BigInt(onChain.amountSats), asset: onChain.rawAssetId };
		chainHeld.push({
			asset: onChain.rawAssetId,
			id: site.id,
			sats: BigInt(onChain.amountSats),
		});

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
		return { reason: issued.reason, refused: true };
	}

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
		return { reason: created.reason, refused: true };
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
			return { reason: derived.reason, refused: true };
		}

		covenants.push({ ...derived.derivation, role: "created", verified: "not-yet-on-chain" });
	}

	const plan = planAction(action, scope, notes, manifest.raw.confidential_outputs);

	if (!plan.ok) {
		return { reason: plan.reason, refused: true };
	}

	let feeRateSatsPerKvb: number;

	try {
		feeRateSatsPerKvb = await input.readFeeRate(FEE_TARGET_BLOCKS);
	} catch (error) {
		return {
			reason: `The wallet could not establish a fee rate, so it will not build this: ${String(error)}`,
			refused: true,
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
		return { reason: reckoned.reason, refused: true };
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
		};
	}

	// Each asset funded out of what the wallet holds in that asset, and short in one of them is
	// a refusal that says which one. The fee is added to the network's own asset and to no
	// other: a second asset never becomes a second fee.
	const funding = fundAssets(ledger.entries, {
		// The fee has no figure until the transaction has been weighed, which is after this. So
		// the network's asset is over-selected by a kilo-vbyte at the chosen rate — enough for a
		// transaction of this size with room to spare — and whatever is left comes back as
		// change. No other asset carries any of it.
		feeSats: feeHeadroomSats(feeRateSatsPerKvb),
		headroomSats: 0n,
		holdings,
		policyAsset: input.policyAsset,
		reserved: issued.reserved,
	});

	if (!funding.ok) {
		return { reason: funding.reason, refused: true };
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
			};
		}

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
	const selected = fundedOrder.flatMap((asset) => fundedFor.get(asset)?.selected ?? []);

	return {
		action: request.action,
		...(action.boundTo === undefined ? {} : { boundTo: action.boundTo }),
		changeBlinded,
		...(changeOverrode === undefined ? {} : { changeOverrode }),
		covenants,
		...(created === undefined ? {} : { createdInstance: created.instance }),
		feeRateSatsPerKvb,
		issuances: issued.issuances,
		normalisation: notes,
		outputs,
		protocol: manifest.protocol ?? "",
		selected,
	};
}

type ResolvedIssuances =
	| { issuances: PlannedIssuance[]; ok: true; reserved: { asset: string; utxo: SelectableUtxo }[] }
	| { ok: false; reason: string };

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
	const reserved: { asset: string; utxo: SelectableUtxo }[] = [];
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
			};
		}

		const asset = resolveAsset(declared.asset, `input ${id}`, {
			notes: context.notes,
			policyAsset: context.policyAsset,
			scope: context.scope,
		});

		if (!asset.ok) {
			return { ok: false, reason: asset.reason };
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
			};
		}

		const resolved = resolveIssuance(
			{ declared: issuance, id, outpoint: { txid: funding.txid, vout: funding.vout } },
			context.scope,
			context.notes,
		);

		if (!resolved.ok) {
			return { ok: false, reason: resolved.reason };
		}

		taken.add(outpointKey(funding));
		reserved.push({ asset: asset.id, utxo: funding });
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
