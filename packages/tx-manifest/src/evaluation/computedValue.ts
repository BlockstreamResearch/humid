import type { NormalisationNote } from "../document/normalise";
import type { ReferenceScope, ReferenceSiteKind } from "../document/references";
import { evaluateExpression } from "./evaluate";

/**
 * A value the document works out for itself, wherever the document writes one.
 *
 * The format lets a protocol state arithmetic in place of a value at more than one position —
 * a parameter's `compute`, an issued amount, an output's amount, a field of the deployment an
 * action creates. They are the same construct and they are read the same way, through
 * `evaluate.ts`. What this file adds is the one question `evaluate.ts` cannot answer for a
 * caller: whether the text in front of it is arithmetic at all.
 *
 * **That question is not cosmetic, and getting it wrong loses a value silently.** Several
 * positions accept a literal and a formula in the same slot, and the corpus writes both — a
 * field holding `"2"` is a field holding two, and a field holding thirty-two zero bytes is an
 * all-zero hash. Both of those are also legal arithmetic: evaluated, the first is unchanged
 * and the second becomes `"0"`, which is a different value at every position that encodes it.
 * Nothing downstream could tell, because `0` is a perfectly good number.
 *
 * So arithmetic is recognised by the operators it is written with rather than by whether it
 * evaluates. A reference, a decimal literal and a hex literal contain none of the characters
 * below; every expression that is more than a single term contains at least one. That is
 * exact for this grammar rather than a heuristic, and it is the reason a literal survives.
 */

/** Every character the expression grammar uses and no single value or name can contain. */
const OPERATORS = new Set(["%", "(", ")", "*", "+", ",", "-", "/"]);

/**
 * Whether this text computes a value rather than being one or naming one.
 *
 * Ask it only after a reference has been tried and failed. A reference never contains one of
 * these characters, so the order does not change any answer today; it is the order that keeps
 * the two readings separable if the reference syntax ever grows one.
 */
export function computesValue(text: string): boolean {
	return [...text].some((character) => OPERATORS.has(character));
}

/**
 * What one computed value comes to, as the string every position records a value as.
 *
 * The site is the caller's, not this file's. A term is legal where the position says it is
 * legal — a formula at a position that cannot see the fee is refused for naming the fee
 * rather than for arithmetic — and passing the position through is what keeps that true of a
 * computed value as much as of a plain reference.
 */
export function computedValue(
	text: string,
	site: ReferenceSiteKind,
	scope: ReferenceScope,
	notes?: NormalisationNote[],
): { ok: false; reason: string } | { ok: true; value: string } {
	const evaluated = evaluateExpression(text, site, scope, notes);

	return evaluated.ok ? { ok: true, value: String(evaluated.value) } : evaluated;
}
