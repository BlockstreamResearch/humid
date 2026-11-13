import { asArray, asRecord } from "./json";

export type ProgramSite = {
	amount?: unknown;
	asset?: unknown;
	blinding?: unknown;
	id: string;
	role: "created" | "spent";
	signatureWitness?: string;
	unusedWitnesses?: string[];
	utxoType: string;
	witnessNames?: string[];
	wiring: Record<string, unknown>;
};

export function programSites(action: Record<string, unknown>): ProgramSite[] {
	const sites: ProgramSite[] = [];

	for (const entry of asArray(action.inputs)) {
		const site = programReference(asRecord(entry)?.utxo_source);

		if (site) {
			const witnesses = asRecord(asRecord(entry)?.witnesses) ?? {};
			const signatureWitness = walletSignatureWitness(witnesses);
			const unusedWitnesses = Object.keys(witnesses).filter((name) => witnesses[name] === "unused");

			sites.push({
				...site,
				amount: asRecord(entry)?.amount_sat,
				asset: asRecord(entry)?.asset,
				blinding: asRecord(entry)?.blinding,
				id: identifierOf(entry),
				role: "spent",
				...(signatureWitness === undefined ? {} : { signatureWitness }),
				...(unusedWitnesses.length === 0 ? {} : { unusedWitnesses }),
				witnessNames: Object.keys(witnesses),
			});
		}
	}

	for (const entry of asArray(action.outputs)) {
		const site = programReference(asRecord(entry)?.destination);

		if (site) {
			sites.push({ ...site, id: identifierOf(entry), role: "created" });
		}
	}

	return sites;
}

export function namedUtxoTypes(action: Record<string, unknown>): string[] {
	return [...new Set(programSites(action).map((site) => site.utxoType))];
}

function programReference(
	value: unknown,
): { utxoType: string; wiring: Record<string, unknown> } | undefined {
	const record = asRecord(value);
	const utxoType = record?.utxo_type;

	if (typeof utxoType !== "string") {
		return undefined;
	}

	return { utxoType, wiring: asRecord(record?.compile_params) ?? {} };
}

function walletSignatureWitness(declared: Record<string, unknown>): string | undefined {
	for (const [name, entry] of Object.entries(declared)) {
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
