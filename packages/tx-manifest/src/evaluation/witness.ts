import type { Action, ProgramInput } from "../document/manifest";
import { type ReferenceScope, parseReference, resolveReference } from "../document/references";
import { Refusal } from "../refusal";

export type StaticWitness = {
	name: string;
	value: string;
};

export const STATIC_WITNESS = "simplicityhl";

export function resolveStaticWitnesses(
	action: Action,
	scope: ReferenceScope,
): Map<string, StaticWitness[]> {
	const witnesses = new Map<string, StaticWitness[]>();

	for (const input of action.inputs) {
		const id = input.label;
		const stated: StaticWitness[] = [];

		for (const [name, witness] of Object.entries(input.witnesses)) {
			if (witness === "unused" || witness.type !== STATIC_WITNESS) {
				continue;
			}

			const { value } = witness;

			if (value === undefined) {
				throw new Refusal(
					`The witness ${name} on input ${id} is a stated value, and the document states no value.`,
				);
			}

			const filled = Refusal.amend(
				() => fill(value, scope),
				(reason) => `The witness ${name} on input ${id}: ${reason}`,
			);

			stated.push({ name, value: filled });
		}

		if (stated.length > 0) {
			witnesses.set(id, stated);
		}
	}

	return witnesses;
}

const NAMED = /[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*/g;

function fill(value: string, scope: ReferenceScope): string {
	return value.replaceAll(NAMED, (text) => {
		if (parseReference(text)?.form === "input-attribute") {
			throw new Refusal(`"${text}" cannot be used as part of a witness value.`);
		}

		return String(resolveReference(text, "witnessValue", scope));
	});
}

export function checkWitnessNames(input: ProgramInput, declared: Record<string, string>): void {
	const named = new Set(Object.keys(input.witnesses));
	const missing = Object.keys(declared).find((name) => !named.has(name));
	const unknown = [...named].find((name) => !Object.hasOwn(declared, name));

	if (missing !== undefined) {
		throw new Refusal(
			`Input ${input.label} leaves out the witness ${missing}, which its ${input.utxo_source.utxo_type} program reads.`,
		);
	}

	if (unknown !== undefined) {
		throw new Refusal(
			`Input ${input.label} names a witness ${unknown}, which its ${input.utxo_source.utxo_type} program does not declare.`,
		);
	}
}

export function signatureWitness(input: ProgramInput): string | undefined {
	return Object.entries(input.witnesses).find(
		([, witness]) =>
			witness !== "unused" && witness.type === "Signature" && witness.source?.type === "wallet",
	)?.[0];
}

export function unusedWitnesses(input: ProgramInput): string[] {
	return Object.keys(input.witnesses).filter((name) => input.witnesses[name] === "unused");
}
