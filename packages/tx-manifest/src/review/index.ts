import type { ReadFeeRate, ReadTxOut } from "../chain/chainRead";
import {
	type CompileCovenant,
	covenantMatchesChain,
	deriveCovenantAddress,
} from "../covenants/covenant";
import { declaredParamTypes } from "../covenants/declaredTypes";
import { asArray, asRecord } from "../document/json";
import { covenantSites } from "../document/sites";
import { planAction } from "../evaluation/plan";
import type { ParsedLiquidProcessCtParams } from "../request/request";
import { resolveActionRequirements } from "../request/requirements";
import { type CoinSelection, type SelectableUtxo, selectCoins } from "./coinSelection";

/**
 * What the wallet established for itself about one covenant this action touches.
 *
 * `verified` is the wallet's own finding, never the site's claim. A covenant the action
 * creates has nothing to compare against yet — its protection is that the destination is
 * derived rather than supplied — and says so rather than reporting a check it did not do.
 */
export type CovenantFinding = {
	address: string;
	role: "created" | "spent";
	/** What an output pays to, which is not the address and is not interchangeable with it. */
	scriptPubKeyHex: string;
	utxoType: string;
	verified: "matches-chain" | "not-yet-on-chain";
};

/** One output of the transaction the wallet worked out, ready to be shown and then built. */
export type ReviewedOutput = {
	/**
	 * The asset this output pays in, as the chain writes the id.
	 *
	 * Carried rather than assumed, because a builder told only an amount pays it in whatever
	 * asset it defaults to. Every output this slice plans pays the network's own asset; the
	 * fact is still written down, because the builder is told it rather than left to guess.
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
 * An exact plan rather than a transaction: nothing here is a builder, a handle or an
 * encoding, and reading it moves nothing. What it settles is every decision the wallet gets
 * to make — which of its outputs pay, what each output pays and to which script, and at what
 * rate — so that whoever drives a builder from it adds what is written here and decides
 * nothing further.
 *
 * Settled before the confirmation rather than after it deliberately: what a person is asked
 * to approve should be the plan that gets built, not a description of one that will be worked
 * out again afterwards from the same inputs and might not match.
 */
export type ManifestReview = {
	action: string;
	covenants: CovenantFinding[];
	/** What the wallet will pay, established from the chain rather than from the request. */
	feeRateSatsPerKvb: number;
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
 * supplied; one being spent is then compared against what the chain says is at its outpoint,
 * and one being created is reported as derived-but-not-yet-on-chain rather than as verified.
 *
 * That distinction is the point. An action that creates a covenant has nothing to compare
 * against, and saying so is more honest than reporting a check that did not happen. Its
 * protection is different in kind: the destination is derived by the wallet rather than
 * supplied by the site.
 *
 * Runs before the permission gate deliberately: a standing permission skips the prompt, so
 * this is the only thing between a request and a signature. Everything it cannot establish is
 * a refusal, and the refusal says which thing — a missing request part named by key, a
 * contract that will not compile, a state file listing no such covenant, a chain that cannot
 * be read, a covenant that does not match, an amount this runtime does not evaluate, a fee
 * rate that could not be read, an account that cannot cover it. There is no return value
 * meaning "probably fine".
 *
 * The plan is settled here rather than after the confirmation: what a person is asked to
 * approve should be what gets built, not a description of it worked out again afterwards from
 * the same inputs. So this also plans the outputs, establishes the fee rate and selects the
 * coins, and everything downstream builds exactly what came back.
 */
export async function reviewManifestAction(
	request: ParsedLiquidProcessCtParams,
	input: {
		compile: CompileCovenant;
		/** The wallet's spendable outputs in the asset the network charges its fees in. */
		fundingUtxos: SelectableUtxo[];
		network: string;
		/** The asset this wallet pays fees in and is the only one this slice moves. */
		policyAsset: string;
		readFeeRate: ReadFeeRate;
		readTxOut: ReadTxOut;
		/** Where the wallet's own share of an action is paid, as a script rather than an address. */
		walletScriptPubKeyHex: string;
	},
): Promise<ReviewManifestActionResult> {
	const requirements = resolveActionRequirements(request);

	if (requirements.missing.length > 0) {
		const named = requirements.missing
			.map((entry) => (entry.keys ? `${entry.reason} (${entry.keys.join(", ")})` : entry.reason))
			.join(" ");

		return { reason: `This request cannot be built. ${named}`, refused: true };
	}

	const action = asRecord(asRecord(request.manifest.actions)?.[request.action]);

	if (!action) {
		return { reason: `The manifest declares no action named "${request.action}".`, refused: true };
	}

	const declaredTypes = declaredParamTypes(action);
	const covenants: CovenantFinding[] = [];

	for (const site of covenantSites(action)) {
		// Sequential on purpose, and the rule is disabled here rather than obeyed. This loop
		// returns on the first site it refuses, so running the sites concurrently would compile
		// contracts and send chain reads for covenants after the answer is already known.
		// oxlint-disable-next-line no-await-in-loop
		const derived = await deriveCovenantAddress(request, {
			compile: input.compile,
			declaredTypes,
			network: input.network,
			utxoType: site.utxoType,
			wiring: site.wiring,
		});

		if (!derived.ok) {
			return { reason: derived.reason, refused: true };
		}

		const { address, scriptPubKeyHex, utxoType } = derived.derivation;

		if (site.role === "created") {
			covenants.push({
				address,
				role: "created",
				scriptPubKeyHex,
				utxoType,
				verified: "not-yet-on-chain",
			});

			continue;
		}

		const outpoint = stateOutpoint(request, utxoType);

		if (!outpoint) {
			return { reason: `The state file lists no ${utxoType} to spend.`, refused: true };
		}

		let onChain;

		try {
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

		covenants.push({
			address,
			role: "spent",
			scriptPubKeyHex,
			utxoType,
			verified: "matches-chain",
		});
	}

	const plan = planAction(request, action);

	if (!plan.ok) {
		return { reason: plan.reason, refused: true };
	}

	// Keyed by the script rather than by the address. They are two spellings of one fact, and
	// only one of them is hex: a builder hex-decodes every output script it is given, so
	// handing it a bech32 address fails inside the module with an error naming neither the
	// output nor what was wrong with it.
	const covenantScripts = new Map(
		covenants.map((found) => [found.utxoType, found.scriptPubKeyHex]),
	);
	const outputs: ReviewedOutput[] = [];

	for (const planned of plan.plan.outputs) {
		if (planned.target.kind === "change" || planned.sats === undefined) {
			continue;
		}

		// A covenant output pays the script the wallet derived, never one the request
		// supplied. There is no path from a site-supplied address to a transaction output.
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
		covenants,
		feeRateSatsPerKvb,
		outputs,
		protocol: typeof request.manifest.protocol === "string" ? request.manifest.protocol : "",
		selected: selection.selected,
	};
}

/** Confirmation target for the fee estimate, in blocks. */
const FEE_TARGET_BLOCKS = 6;

/**
 * What to over-select by so the finished transaction can pay its own fee.
 *
 * The real fee comes from the assembled transaction's weight, which does not exist until
 * after selection. A small transaction is on the order of a kilo-vbyte, so one kvb at the
 * chosen rate covers it with room to spare, and whatever is left over comes back as change.
 */
function feeHeadroomSats(feeRateSatsPerKvb: number): bigint {
	return BigInt(Math.ceil(feeRateSatsPerKvb));
}

/**
 * Where the state file says this deployment's covenant of that type sits.
 *
 * The state file carries an outpoint and no script: what is at an outpoint is read from the
 * chain rather than told by whoever asked, which is the whole reason the comparison means
 * anything.
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
