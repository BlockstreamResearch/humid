import type { NormalisationNote } from "./normalise";
import { type ReferenceScope, type ReferenceSiteKind, resolveReference } from "./references";

export type EvaluationResult = { ok: true; value: bigint } | { ok: false; reason: string };

/**
 * The range every value in an expression must stay inside.
 *
 * The format defines no arithmetic. The reference implementation hands expressions to a
 * third-party crate's signed 64-bit integer mode, so signed 64-bit is the range real
 * manifests were authored against and matching it is not a choice. What that crate does at
 * the edges is a choice, and it is made below.
 */
const I64_MAX = 2n ** 63n - 1n;
const I64_MIN = -(2n ** 63n);

/**
 * Evaluates one amount expression against the values available at a site.
 *
 * Three properties are inherited from the behaviour real manifests were written against,
 * and are not ours to vary: arithmetic is signed rather than unsigned, so an intermediate
 * may go negative and come back; division truncates toward zero; and only the caller checks
 * the final value for being negative, because an amount and a difference are different
 * questions.
 *
 * Three are ours, because the reference inherits them from a Rust crate this runtime does
 * not use, and inheriting them by accident is how amounts diverge silently:
 *
 * - **Leaving the 64-bit range is an error, never a wrap.** A wrapped amount is a
 *   different amount, and nothing downstream could tell.
 * - **Division or remainder by zero is an error**, rather than any particular value.
 * - **A negative exponent is an error**, where the reference leaves the call unexpanded and
 *   carries on with text that then fails to parse somewhere less informative.
 *
 * Every term resolves through the same site table as a bare reference, so a term that is
 * illegal at this position is refused as a position error rather than as arithmetic.
 */
export function evaluateExpression(
	text: string,
	site: ReferenceSiteKind,
	scope: ReferenceScope,
	notes?: NormalisationNote[],
): EvaluationResult {
	const tokens = tokenise(text);

	if (!tokens.ok) {
		return unreadable(text);
	}

	const reader = { at: 0, notes, scope, site, tokens: tokens.tokens };
	const value = readSum(reader);

	if (!value.ok) {
		// Every refusal carries the expression it came from. The reader of this message is a
		// person deciding whether to trust a site, and "this amount divides by zero" without
		// the amount leaves them nothing to act on or report.
		return { ok: false, reason: `${value.reason} The expression was "${text}".` };
	}

	return reader.at === reader.tokens.length ? value : unreadable(text);
}

function unreadable(text: string): EvaluationResult {
	return { ok: false, reason: `"${text}" is not an expression this runtime reads.` };
}

type Token = { kind: "name" | "number" | "symbol"; text: string };

type Reader = {
	at: number;
	notes?: NormalisationNote[];
	scope: ReferenceScope;
	site: ReferenceSiteKind;
	tokens: Token[];
};

const SYMBOLS = new Set(["+", "-", "*", "/", "%", "(", ")", ","]);

function tokenise(text: string): { ok: true; tokens: Token[] } | { ok: false } {
	const tokens: Token[] = [];
	let at = 0;

	while (at < text.length) {
		const character = text[at] ?? "";

		if (/\s/.test(character)) {
			at += 1;

			continue;
		}

		if (SYMBOLS.has(character)) {
			tokens.push({ kind: "symbol", text: character });
			at += 1;

			continue;
		}

		// A name may carry the reference syntax — a `$` prefix and one dotted segment — so
		// the whole term reaches the resolver as it was written.
		const name = /^\$?[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?/.exec(text.slice(at));

		if (name) {
			tokens.push({ kind: "name", text: name[0] });
			at += name[0].length;

			continue;
		}

		const number = /^\d+/.exec(text.slice(at));

		if (number) {
			tokens.push({ kind: "number", text: number[0] });
			at += number[0].length;

			continue;
		}

		return { ok: false };
	}

	return tokens.length > 0 ? { ok: true, tokens } : { ok: false };
}

function peek(reader: Reader): Token | undefined {
	return reader.tokens[reader.at];
}

function eat(reader: Reader, text: string): boolean {
	if (peek(reader)?.text === text) {
		reader.at += 1;

		return true;
	}

	return false;
}

function readSum(reader: Reader): EvaluationResult {
	let left = readProduct(reader);

	if (!left.ok) {
		return left;
	}

	for (;;) {
		const operator = peek(reader);

		if (operator?.kind !== "symbol" || (operator.text !== "+" && operator.text !== "-")) {
			return left;
		}

		reader.at += 1;

		const right = readProduct(reader);

		if (!right.ok) {
			return right;
		}

		const combined = bounded(
			operator.text === "+" ? left.value + right.value : left.value - right.value,
		);

		if (!combined.ok) {
			return combined;
		}

		left = combined;
	}
}

function readProduct(reader: Reader): EvaluationResult {
	let left = readUnary(reader);

	if (!left.ok) {
		return left;
	}

	for (;;) {
		const operator = peek(reader);

		if (
			operator?.kind !== "symbol" ||
			(operator.text !== "*" && operator.text !== "/" && operator.text !== "%")
		) {
			return left;
		}

		reader.at += 1;

		const right = readUnary(reader);

		if (!right.ok) {
			return right;
		}

		if (operator.text !== "*" && right.value === 0n) {
			return {
				ok: false,
				reason: `This amount divides by zero, and no value is the right answer to that.`,
			};
		}

		const combined = bounded(
			operator.text === "*"
				? left.value * right.value
				: operator.text === "/"
					? left.value / right.value
					: left.value % right.value,
		);

		if (!combined.ok) {
			return combined;
		}

		left = combined;
	}
}

function readUnary(reader: Reader): EvaluationResult {
	if (eat(reader, "-")) {
		const inner = readUnary(reader);

		return inner.ok ? bounded(-inner.value) : inner;
	}

	return readTerm(reader);
}

function readTerm(reader: Reader): EvaluationResult {
	const token = peek(reader);

	if (!token) {
		return { ok: false, reason: "This amount ends where a value was expected." };
	}

	if (token.text === "(") {
		reader.at += 1;

		const inner = readSum(reader);

		if (!inner.ok) {
			return inner;
		}

		return eat(reader, ")")
			? inner
			: { ok: false, reason: "This amount opens a bracket it never closes." };
	}

	if (token.kind === "number") {
		reader.at += 1;

		return bounded(BigInt(token.text));
	}

	if (token.kind !== "name") {
		return { ok: false, reason: `This amount uses "${token.text}", which is not a value.` };
	}

	reader.at += 1;

	return peek(reader)?.text === "(" ? readCall(reader, token.text) : readReference(reader, token);
}

/**
 * `pow` is the only function the format has, and the reference expands it before evaluating
 * rather than passing it through. Anything else named like a call is refused by name: a
 * function nobody implements silently returning something is how an amount goes wrong
 * without an error.
 */
function readCall(reader: Reader, name: string): EvaluationResult {
	if (name !== "pow") {
		return { ok: false, reason: `This amount calls "${name}", which this runtime does not have.` };
	}

	reader.at += 1;

	const base = readSum(reader);

	if (!base.ok) {
		return base;
	}

	if (!eat(reader, ",")) {
		return { ok: false, reason: "pow takes a base and an exponent." };
	}

	const exponent = readSum(reader);

	if (!exponent.ok) {
		return exponent;
	}

	if (!eat(reader, ")")) {
		return { ok: false, reason: "This amount opens a bracket it never closes." };
	}

	if (exponent.value < 0n) {
		return { ok: false, reason: "pow was given a negative exponent, which has no whole answer." };
	}

	if (exponent.value > 63n) {
		return { ok: false, reason: "pow was given an exponent beyond the 64-bit range." };
	}

	return bounded(base.value ** exponent.value);
}

function readReference(reader: Reader, token: Token): EvaluationResult {
	const found = resolveReference(token.text, reader.site, reader.scope, reader.notes);

	if (!found.ok) {
		return found;
	}

	const count = asInteger(found.value);

	return count === undefined
		? {
				ok: false,
				reason: `"${token.text}" is not a number, so it cannot be part of an amount.`,
			}
		: bounded(count);
}

function asInteger(value: unknown): bigint | undefined {
	if (typeof value === "bigint") {
		return value;
	}

	if (typeof value === "number") {
		return Number.isSafeInteger(value) ? BigInt(value) : undefined;
	}

	return typeof value === "string" && /^-?\d+$/.test(value) ? BigInt(value) : undefined;
}

function bounded(value: bigint): EvaluationResult {
	return value > I64_MAX || value < I64_MIN
		? { ok: false, reason: "This amount leaves the 64-bit range these numbers are held in." }
		: { ok: true, value };
}

/**
 * Evaluates a validation's condition: two amounts and one comparison between them.
 *
 * Deliberately not a boolean expression language. Every validation in the corpus is one
 * comparison, and a rule this runtime read only half of would be worse than one it refused
 * outright — a validation exists to stop a transaction its protocol considers invalid, so
 * getting it wrong permits exactly what it was written to prevent.
 */
export function evaluateCondition(
	text: string,
	site: ReferenceSiteKind,
	scope: ReferenceScope,
	notes?: NormalisationNote[],
): { met: boolean; ok: true } | { ok: false; reason: string } {
	const split = /^(?<left>.+?)\s*(?<operator>>=|<=|==|!=|>|<)\s*(?<right>.+)$/.exec(text.trim());
	const operator = split?.groups?.operator;

	if (!operator) {
		return {
			ok: false,
			reason: `"${text}" is not a comparison, and this runtime reads no other condition.`,
		};
	}

	const left = evaluateExpression(split?.groups?.left ?? "", site, scope, notes);

	if (!left.ok) {
		return left;
	}

	const right = evaluateExpression(split?.groups?.right ?? "", site, scope, notes);

	if (!right.ok) {
		return right;
	}

	switch (operator) {
		case "!=": {
			return { met: left.value !== right.value, ok: true };
		}

		case "<": {
			return { met: left.value < right.value, ok: true };
		}

		case "<=": {
			return { met: left.value <= right.value, ok: true };
		}

		case "==": {
			return { met: left.value === right.value, ok: true };
		}

		case ">": {
			return { met: left.value > right.value, ok: true };
		}

		default: {
			return { met: left.value >= right.value, ok: true };
		}
	}
}
