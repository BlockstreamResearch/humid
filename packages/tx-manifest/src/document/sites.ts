import { asArray, asRecord } from "./json";

/**
 * One place in an action where a covenant appears, and which side it is on.
 *
 * Inputs spend a covenant, outputs create one, and the distinction decides whether there
 * is anything on chain to compare a derived covenant against. Enumerating both from one
 * place is what stops "where are the covenants" being answered differently by whichever
 * function happens to be asking.
 */
export type CovenantSite = {
	role: "created" | "spent";
	utxoType: string;
	/** The compile parameters wired in at this site, unresolved. */
	wiring: Record<string, unknown>;
};

export function covenantSites(action: Record<string, unknown>): CovenantSite[] {
	const sites: CovenantSite[] = [];

	for (const entry of asArray(action.inputs)) {
		const site = covenantReference(asRecord(entry)?.utxo_source);

		if (site) {
			sites.push({ ...site, role: "spent" });
		}
	}

	for (const entry of asArray(action.outputs)) {
		const site = covenantReference(asRecord(entry)?.destination);

		if (site) {
			sites.push({ ...site, role: "created" });
		}
	}

	return sites;
}

/** The utxo types this action reaches, in the order it names them. */
export function namedUtxoTypes(action: Record<string, unknown>): string[] {
	return [...new Set(covenantSites(action).map((site) => site.utxoType))];
}

/**
 * The covenant one input source or output destination names, if it names one.
 *
 * The keywords — `wallet`, `change` — are written where the object would be, so anything
 * that is not an object naming a `utxo_type` is not a covenant site.
 */
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
