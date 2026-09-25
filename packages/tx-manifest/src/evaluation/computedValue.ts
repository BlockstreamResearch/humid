import type { NormalisationNote } from "../document/normalise";
import type { ReferenceScope, ReferenceSiteKind } from "../document/references";
import { evaluateExpression } from "./evaluate";

const OPERATORS = new Set(["%", "(", ")", "*", "+", ",", "-", "/"]);

export function computesValue(text: string): boolean {
	return [...text].some((character) => OPERATORS.has(character));
}

export function computedValue(
	text: string,
	site: ReferenceSiteKind,
	scope: ReferenceScope,
	notes?: NormalisationNote[],
): { ok: false; reason: string } | { ok: true; value: string } {
	const evaluated = evaluateExpression(text, site, scope, notes);

	return evaluated.ok ? { ok: true, value: String(evaluated.value) } : evaluated;
}
