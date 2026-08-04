import { asArray, asRecord } from "./json";
import type { NormalisedAction } from "./normalise";

/**
 * One place in an action where a covenant appears, and which side it is on.
 *
 * Inputs spend a covenant, outputs create one, and the distinction decides whether there
 * is anything on chain to compare a derived address against. Enumerating both from one
 * place is what stops "where are the covenants" being answered differently by whichever
 * function happens to be asking.
 */
export type CovenantSite = {
	/** The manifest's id for this input or output, which its amounts refer to it by. */
	id: string;
	role: "created" | "spent";
	utxoType: string;
	/** The compile parameters wired in at this site, unresolved. */
	wiring: Record<string, unknown>;
};

export function covenantSites(action: NormalisedAction): CovenantSite[] {
	const sites: CovenantSite[] = [];

	for (const entry of asArray(action.node.inputs)) {
		const site = covenantReference(asRecord(entry)?.utxo_source);

		if (site) {
			sites.push({ ...site, id: identifierOf(entry), role: "spent" });
		}
	}

	for (const entry of asArray(action.node.outputs)) {
		const site = covenantReference(asRecord(entry)?.destination);

		if (site) {
			sites.push({ ...site, id: identifierOf(entry), role: "created" });
		}
	}

	return sites;
}

/** The utxo types this action reaches, in the order it names them. */
export function namedUtxoTypes(action: NormalisedAction): string[] {
	return [...new Set(covenantSites(action).map((site) => site.utxoType))];
}

function identifierOf(entry: unknown): string {
	const id = asRecord(entry)?.id;

	return typeof id === "string" ? id : "";
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
