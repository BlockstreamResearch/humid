import { asArray, asRecord } from "./json";

export type CovenantSite = {
	asset?: unknown;
	id: string;
	role: "created" | "spent";
	signatureWitness?: string;
	utxoType: string;
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
				asset: asRecord(entry)?.asset,
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

export function namedUtxoTypes(action: Record<string, unknown>): string[] {
	return [...new Set(covenantSites(action).map((site) => site.utxoType))];
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
