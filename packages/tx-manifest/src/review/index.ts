import type { ReadTxOut } from "../chain/chainRead";
import {
	type CompileCovenant,
	covenantMatchesChain,
	deriveCovenantAddress,
} from "../covenants/covenant";
import { declaredParamTypes } from "../covenants/declaredTypes";
import { asArray, asRecord } from "../document/json";
import { covenantSites } from "../document/sites";
import type { ParsedLiquidProcessCtParams } from "../request/request";
import { resolveActionRequirements } from "../request/requirements";

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

/**
 * Everything the wallet established about an action, before anyone approves it.
 *
 * A description of established fact rather than something to sign: what the action is, which
 * protocol declared it, and what was found out about every covenant it touches. Building the
 * transaction is a later step and reads this rather than repeating it.
 */
export type ManifestReview = {
	action: string;
	covenants: CovenantFinding[];
	protocol: string;
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
 * be read, a covenant that does not match. There is no return value meaning "probably fine".
 */
export async function reviewManifestAction(
	request: ParsedLiquidProcessCtParams,
	input: {
		compile: CompileCovenant;
		network: string;
		readTxOut: ReadTxOut;
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

	return {
		action: request.action,
		covenants,
		protocol: typeof request.manifest.protocol === "string" ? request.manifest.protocol : "",
	};
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
