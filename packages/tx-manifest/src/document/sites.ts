import { asArray, asRecord } from "./json";
import type { NormalisedAction, NormalisedManifest } from "./normalise";

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
	/**
	 * The witness this covenant's program needs a signature for, when it has one.
	 *
	 * A covenant that authenticates whoever spends it declares a `Signature` witness sourced
	 * from a wallet key, and the signer is the only thing that can fill it — nothing in the
	 * request could, because the signature is over a transaction that does not exist yet.
	 * Absent for a covenant that needs no signature, and for one being created.
	 */
	signatureWitness?: string;
	utxoType: string;
	/** The compile parameters wired in at this site, unresolved. */
	wiring: Record<string, unknown>;
};

export function covenantSites(action: NormalisedAction): CovenantSite[] {
	const sites: CovenantSite[] = [];

	for (const entry of asArray(action.node.inputs)) {
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

/**
 * The witness a wallet key must sign, from an input's witness declarations.
 *
 * Only a `Signature` witness sourced from the wallet qualifies. One with a literal value is
 * already supplied, and one sourced from a formula is worked out rather than signed — asking
 * the signer for either would produce a signature nothing checks.
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
