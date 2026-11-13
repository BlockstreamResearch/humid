import { asArray, asRecord } from "./json";

export type ProgramUse = {
	amount?: unknown;
	asset?: unknown;
	blinding?: unknown;
	id: string;
	role: "created" | "spent";
	signatureWitness?: string;
	unusedWitnesses?: string[];
	args?: unknown;
	utxoType: string;
	witnessNames?: string[];
	wiring: Record<string, unknown>;
};

export function programUses(action: Record<string, unknown>): ProgramUse[] {
	const uses: ProgramUse[] = [];

	for (const entry of asArray(action.inputs)) {
		const use = programReference(asRecord(entry)?.utxo_source);

		if (use) {
			const witnesses = asRecord(asRecord(entry)?.witnesses) ?? {};
			const signatureWitness = walletSignatureWitness(witnesses);
			const unusedWitnesses = Object.keys(witnesses).filter((name) => witnesses[name] === "unused");

			uses.push({
				...use,
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
		const use = programReference(asRecord(entry)?.destination);

		if (use) {
			uses.push({ ...use, id: identifierOf(entry), role: "created" });
		}
	}

	return uses;
}

export function namedUtxoTypes(action: Record<string, unknown>): string[] {
	return [...new Set(programUses(action).map((use) => use.utxoType))];
}

function programReference(
	value: unknown,
): { args?: unknown; utxoType: string; wiring: Record<string, unknown> } | undefined {
	const record = asRecord(value);
	const utxoType = record?.utxo_type;

	if (typeof utxoType !== "string") {
		return undefined;
	}

	return {
		...(record?.args === undefined ? {} : { args: record.args }),
		utxoType,
		wiring: asRecord(record?.compile_params) ?? {},
	};
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
