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
): string {
	return String(evaluateExpression(text, site, scope));
}
