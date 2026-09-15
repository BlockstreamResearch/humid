import { asArray, asRecord } from "./json";
import type { NormalisedManifest } from "./normalise";

/**
 * One place in an action where a covenant appears, and which side it is on.
 *
 * Inputs spend a covenant, outputs create one, and the distinction decides whether there
 * is anything on chain to compare a derived covenant against. Enumerating both from one
 * place is what stops "where are the covenants" being answered differently by whichever
 * function happens to be asking.
 */
export type CovenantSite = {
	/**
	 * The manifest's id for this input or output.
	 *
	 * Carried because what the chain reports at a spent covenant's outpoint is a fact about
	 * that input, and an action's own amounts and assets refer to an input by this name. Empty
	 * where the document names none, which nothing can then refer to.
	 */
	id: string;
	role: "created" | "spent";
	/**
	 * The witness this covenant's program needs a signature for, when it has one.
	 *
	 * A covenant that authenticates whoever spends it declares a `Signature` witness sourced
	 * from a wallet key, and the signer is the only thing that can fill it — nothing the
	 * request supplies could, because the signature is over a transaction that does not exist
	 * until the wallet has assembled it. Carried through by name rather than worked out again
	 * where the spend is built, because the document is read once.
	 *
	 * Absent for a covenant that needs no signature, and for one being created.
	 */
	signatureWitness?: string;
	utxoType: string;
	/** The compile parameters wired in at this site, unresolved. */
	wiring: Record<string, unknown>;
};

export function covenantSites(action: Record<string, unknown>): CovenantSite[] {
	const sites: CovenantSite[] = [];

	for (const entry of asArray(action.inputs)) {
		const site = covenantReference(asRecord(entry)?.utxo_source);

		if (site) {
			const signatureWitness = walletSignatureWitness(asRecord(entry)?.witnesses);

			sites.push({
				...site,
				id: identifierOf(entry),
				role: "spent",
				...(signatureWitness === undefined ? {} : { signatureWitness }),
			});
		}
	}

	for (const entry of asArray(action.outputs)) {
		const site = covenantReference(asRecord(entry)?.destination);

		if (site) {
			sites.push({ ...site, id: identifierOf(entry), role: "created" });
		}
	}

	return sites;
}

/** The utxo types this action reaches, in the order it names them. */
export function namedUtxoTypes(action: Record<string, unknown>): string[] {
	return [...new Set(covenantSites(action).map((site) => site.utxoType))];
}

/**
 * Every contract source path the whole document references, through the covenants it declares.
 *
 * The action-scoped question — which sources does *this* action need — belongs to a request and
 * is asked there. This is the document-wide one, which is what a reader holding no request has
 * to ask before it can say whether it read the contracts or only the document.
 */
export function contractSourcePaths(manifest: NormalisedManifest): string[] {
	const paths = new Set<string>();

	for (const declared of Object.values(manifest.utxoTypes)) {
		const source = asRecord(asRecord(declared)?.script)?.source;

		if (typeof source === "string") {
			paths.add(source);
		}
	}

	return [...paths];
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

/**
 * The witness a wallet key must sign, from an input's witness declarations.
 *
 * Only a `Signature` witness sourced from the wallet qualifies. One with a literal value is
 * already supplied and one worked out from a formula is computed rather than signed, so asking
 * the signer for either would produce a signature nothing checks — and, worse, would leave the
 * witness the contract does read unfilled.
 */
function walletSignatureWitness(declared: unknown): string | undefined {
	for (const [name, entry] of Object.entries(asRecord(declared) ?? {})) {
		const witness = asRecord(entry);

		if (witness?.type === "Signature" && asRecord(witness.source)?.type === "wallet") {
			return name;
		}
	}

	return undefined;
}

function identifierOf(entry: unknown): string {
	const id = asRecord(entry)?.id;

	return typeof id === "string" ? id : "";
}
