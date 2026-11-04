import { asArray, asRecord } from "../document/json";
import type { NormalisedAction } from "../document/normalise";
import { type ReferenceScope, parseReference, resolveReference } from "../document/references";
import { Refusal } from "../refusal";

export type StaticWitness = {
	name: string;
	simplicityType: string;
	value: string;
};

export const STATIC_WITNESS = "simplicityhl";

export function resolveStaticWitnesses(
	action: NormalisedAction,
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

			const simplicityType = witness.simplicity_type;
			const value = witness.value;

			if (typeof simplicityType !== "string" || typeof value !== "string") {
				throw new Refusal(
					`The witness ${name} on input ${id} is a stated value, and the document states ` +
						"either no type for it or no value.",
				);
			}

			const filled = Refusal.amend(
				() => fill(value, scope),
				(reason) => `The witness ${name} on input ${id}: ${reason}`,
			);

			stated.push({ name, simplicityType, value: filled });
		}

		if (stated.length > 0) {
			witnesses.set(id, stated);
		}
	}

	return witnesses;
}

const NAMED = /\$?[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*){1,2}/g;

function fill(value: string, scope: ReferenceScope): string {
	return value.replaceAll(NAMED, (text) => {
		if (parseReference(text)?.form === "input-attribute") {
			throw new Refusal(`"${text}" cannot be used as part of a witness value.`);
		}

		return String(resolveReference(text, "witnessValue", scope).value);
	});
}
