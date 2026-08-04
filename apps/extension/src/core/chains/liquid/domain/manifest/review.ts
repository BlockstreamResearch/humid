import type { ReadTxOut } from "./chainRead";
import { type CompileCovenant, covenantMatchesChain, deriveCovenantAddress } from "./covenant";
import { resolveActionRequirements } from "./requirements";
import type { ParsedLiquidProcessCtParams } from "./types";

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
	utxoType: string;
	verified: "matches-chain" | "not-yet-on-chain";
};

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
 * Runs before the permission gate deliberately: a standing permission skips the prompt,
 * so this is the only thing between a request and a signature. Everything it cannot
 * establish is a refusal — there is no return value that means "probably fine".
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

	const action = findAction(request);

	if (!action) {
		return { reason: `The manifest declares no action named "${request.action}".`, refused: true };
	}

	const declaredTypes = declaredParamTypes(action);
	const covenants: CovenantFinding[] = [];

	for (const site of covenantSites(action)) {
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

		if (site.role === "created") {
			covenants.push({
				address: derived.derivation.address,
				role: "created",
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
			};
		}

		let onChain;

		try {
			onChain = await input.readTxOut(outpoint);
		} catch (error) {
			return {
				reason: `Could not read what is at ${outpoint.txid}:${outpoint.vout}: ${String(error)}`,
				refused: true,
			};
		}

		const matched = covenantMatchesChain(derived.derivation, onChain.scriptPubKeyAddress);

		if (!matched.matched) {
			return { reason: matched.reason, refused: true };
		}

		covenants.push({
			address: derived.derivation.address,
			role: "spent",
			utxoType: site.utxoType,
			verified: "matches-chain",
		});
	}

	return {
		action: request.action,
		covenants,
		protocol: typeof request.manifest.protocol === "string" ? request.manifest.protocol : "",
	};
}

type CovenantSite = {
	role: "created" | "spent";
	utxoType: string;
	wiring: Record<string, unknown>;
};

/**
 * Every place in the action where a covenant appears, and which side it is on.
 *
 * Inputs spend a covenant, outputs create one. The distinction decides whether there is
 * anything on chain to compare the derived address against.
 */
function covenantSites(action: Record<string, unknown>): CovenantSite[] {
	const sites: CovenantSite[] = [];

	for (const input of asArray(action.inputs)) {
		const site = covenantReference(asRecord(input)?.utxo_source);

		if (site) {
			sites.push({ ...site, role: "spent" });
		}
	}

	for (const output of asArray(action.outputs)) {
		const site = covenantReference(asRecord(output)?.destination);

		if (site) {
			sites.push({ ...site, role: "created" });
		}
	}

	return sites;
}

function covenantReference(
	value: unknown,
): { utxoType: string; wiring: Record<string, unknown> } | undefined {
	const record = asRecord(value);
	const utxoType = record?.utxo_type;

	if (typeof utxoType !== "string") {
		return undefined;
	}

	return { utxoType, wiring: asRecord(record?.compile_params) ?? {} };
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

function findAction(request: ParsedLiquidProcessCtParams): Record<string, unknown> | undefined {
	const flat = asRecord(asRecord(request.manifest.actions)?.[request.action]);

	if (flat) {
		return flat;
	}

	for (const declared of Object.values(asRecord(request.manifest.classes) ?? {})) {
		const method = asRecord(asRecord(asRecord(declared)?.methods)?.[request.action]);

		if (method) {
			return method;
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

function asArray(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}
