import type { ReadFeeRate, ReadTxOut } from "../chain/chainRead";
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
	normaliseInstance,
	normaliseManifest,
} from "../document/normalise";
import type { ReferenceScope } from "../document/references";
import { covenantSites } from "../document/sites";
import { planAction } from "../evaluation/plan";
import type { ParsedLiquidProcessCtParams } from "../request/request";
import { resolveActionRequirements } from "../request/requirements";
import { type CoinSelection, type SelectableUtxo, selectCoins } from "./coinSelection";

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
	id: string;
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
		network: string;
		/** The asset this wallet pays fees in and is the only one this slice moves. */
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
	let scope: ReferenceScope = { instance: deployment.instance.fields, params: request.params };

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

		covenants.push({ ...derived.derivation, role: "spent", verified: "matches-chain" });
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

	const plan = planAction(action.node, scope, notes);

	if (!plan.ok) {
		return { reason: plan.reason, refused: true };
	}

	// Keyed by the script rather than by the address. They are two spellings of one fact, and only
	// one of them is hex: a builder hex-decodes every output script it is given, so handing it a
	// bech32 address fails inside the module with an error naming neither the output nor what was
	// wrong with it.
	const covenantScripts = new Map(
		covenants.map((found) => [found.utxoType, found.scriptPubKeyHex]),
	);
	const outputs: ReviewedOutput[] = [];

	for (const planned of plan.plan.outputs) {
		if (planned.target.kind === "change" || planned.sats === undefined) {
			continue;
		}

		// A covenant output pays the script the wallet derived, never one the request supplied.
		// There is no path from a site-supplied address to a transaction output.
		const scriptPubKeyHex =
			planned.target.kind === "covenant"
				? covenantScripts.get(planned.target.utxoType)
				: input.walletScriptPubKeyHex;

		if (!scriptPubKeyHex) {
			return {
				reason: `Output ${planned.id} pays a covenant the wallet did not verify.`,
				refused: true,
			};
		}

		outputs.push({ asset: input.policyAsset, id: planned.id, sats: planned.sats, scriptPubKeyHex });
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

	const selection: CoinSelection = selectCoins(
		input.fundingUtxos,
		plan.plan.fundingSats,
		feeHeadroomSats(feeRateSatsPerKvb),
	);

	if (!selection.ok) {
		return { reason: selection.reason, refused: true };
	}

	return {
		action: request.action,
		...(action.boundTo === undefined ? {} : { boundTo: action.boundTo }),
		covenants,
		...(created === undefined ? {} : { createdInstance: created.instance }),
		feeRateSatsPerKvb,
		normalisation: notes,
		outputs,
		protocol: manifest.protocol ?? "",
		selected: selection.selected,
	};
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
