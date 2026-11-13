import { asArray, asRecord } from "../document/json";
import type { Action } from "../document/manifest";
import type { ProgramUse } from "../document/programUses";
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

	for (const entry of asArray(action.node.inputs)) {
		const input = asRecord(entry);

		if (!input) {
			continue;
		}

		const id = typeof input.id === "string" ? input.id : "(unnamed)";
		const stated: StaticWitness[] = [];

		for (const [name, declared] of Object.entries(asRecord(input.witnesses) ?? {})) {
			const witness = asRecord(declared);

			if (witness?.type !== STATIC_WITNESS) {
				continue;
			}

			const value = witness.value;

			if (typeof value !== "string") {
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

		return String(resolveReference(text, "witnessValue", scope).value);
	});
}

export function checkWitnessNames(use: ProgramUse, declared: Record<string, string>): void {
	const named = new Set(use.witnessNames);
	const missing = Object.keys(declared).find((name) => !named.has(name));
	const unknown = [...named].find((name) => !Object.hasOwn(declared, name));

	if (missing !== undefined) {
		throw new Refusal(
			`Input ${use.id} leaves out the witness ${missing}, which its ${use.utxoType} program reads.`,
		);
	}

	if (unknown !== undefined) {
		throw new Refusal(
			`Input ${use.id} names a witness ${unknown}, which its ${use.utxoType} program does not declare.`,
		);
	}
}
