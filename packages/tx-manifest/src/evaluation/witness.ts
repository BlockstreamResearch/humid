import { asArray, asRecord } from "../document/json";
import type { NormalisedAction } from "../document/normalise";
import { type ReferenceScope, parseReference, resolveReference } from "../document/references";

export type StaticWitness = {
	name: string;
	simplicityType: string;
	value: string;
};

export type StaticWitnessResult =
	| { ok: false; reason: string }
	| { ok: true; witnesses: Map<string, StaticWitness[]> };

export const STATIC_WITNESS = "simplicityhl";

export function resolveStaticWitnesses(
	action: NormalisedAction,
	scope: ReferenceScope,
): StaticWitnessResult {
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
				return {
					ok: false,
					reason:
						`The witness ${name} on input ${id} is a stated value, and the document states ` +
						"either no type for it or no value.",
				};
			}

			const filled = fill(value, scope);

			if (!filled.ok) {
				return { ok: false, reason: `The witness ${name} on input ${id}: ${filled.reason}` };
			}

			stated.push({ name, simplicityType, value: filled.value });
		}

		if (stated.length > 0) {
			witnesses.set(id, stated);
		}
	}

	return { ok: true, witnesses };
}

const NAMED = /\$?[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*/g;

function fill(
	value: string,
	scope: ReferenceScope,
): { ok: false; reason: string } | { ok: true; value: string } {
	let failure: string | undefined;

	const filled = value.replaceAll(NAMED, (text) => {
		const reference = parseReference(text);

		if (reference?.form === "input-attribute") {
			failure ??= `"${text}" cannot be used as part of a witness value.`;

			return text;
		}

		const found = resolveReference(text, "witnessValue", scope);

		if (!found.ok) {
			failure ??= found.reason;

			return text;
		}

		return String(found.value);
	});

	return failure === undefined ? { ok: true, value: filled } : { ok: false, reason: failure };
}
