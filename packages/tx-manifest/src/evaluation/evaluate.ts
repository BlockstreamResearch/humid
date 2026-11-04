import {
	type ReferenceScope,
	type ReferenceSiteKind,
	resolveReference,
} from "../document/references";
import { Refusal } from "../refusal";

const I64_MAX = 2n ** 63n - 1n;
const I64_MIN = -(2n ** 63n);

export function evaluateExpression(
	text: string,
	site: ReferenceSiteKind,
	scope: ReferenceScope,
): bigint {
	const tokens = tokenise(text);

	if (!tokens) {
		throw unreadable(text);
	}

	const reader = { at: 0, scope, site, tokens };
	const value = Refusal.amend(
		() => readSum(reader),
		(reason) => `${reason} The expression was "${text}".`,
	);

	if (reader.at !== reader.tokens.length) {
		throw unreadable(text);
	}

	return value;
}

function unreadable(text: string): Refusal {
	return new Refusal(`"${text}" is not an expression this runtime reads.`);
}

type Token = { kind: "name" | "number" | "symbol"; text: string };

type Reader = {
	at: number;
	scope: ReferenceScope;
	site: ReferenceSiteKind;
	tokens: Token[];
};

const SYMBOLS = new Set(["+", "-", "*", "/", "%", "(", ")", ","]);

function tokenise(text: string): Token[] | undefined {
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

		const name = /^\$?[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*){0,2}/.exec(text.slice(at));

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

		return undefined;
	}

	return tokens.length > 0 ? tokens : undefined;
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

function expect(reader: Reader, text: string, reason: string): void {
	if (!eat(reader, text)) {
		throw new Refusal(reason);
	}
}

function readSum(reader: Reader): bigint {
	let left = readProduct(reader);

	for (;;) {
		const operator = peek(reader)?.text;

		if (operator !== "+" && operator !== "-") {
			return left;
		}

		reader.at += 1;

		const right = readProduct(reader);

		left = bounded(operator === "+" ? left + right : left - right);
	}
}

function readProduct(reader: Reader): bigint {
	let left = readUnary(reader);

	for (;;) {
		const operator = peek(reader)?.text;

		if (operator !== "*" && operator !== "/" && operator !== "%") {
			return left;
		}

		reader.at += 1;

		const right = readUnary(reader);

		if (operator !== "*" && right === 0n) {
			throw new Refusal("This amount divides by zero, and no value is the right answer to that.");
		}

		left = bounded(
			operator === "*" ? left * right : operator === "/" ? left / right : left % right,
		);
	}
}

function readUnary(reader: Reader): bigint {
	return eat(reader, "-") ? bounded(-readUnary(reader)) : readTerm(reader);
}

function readTerm(reader: Reader): bigint {
	const token = peek(reader);

	if (!token) {
		throw new Refusal("This amount ends where a value was expected.");
	}

	reader.at += 1;

	if (token.text === "(") {
		const inner = readSum(reader);

		expect(reader, ")", "This amount opens a bracket it never closes.");

		return inner;
	}

	if (token.kind === "number") {
		return bounded(BigInt(token.text));
	}

	if (token.kind !== "name") {
		throw new Refusal(`This amount uses "${token.text}", which is not a value.`);
	}

	return peek(reader)?.text === "(" ? readCall(reader, token.text) : readReference(reader, token);
}

function readCall(reader: Reader, name: string): bigint {
	if (name !== "pow") {
		throw new Refusal(`This amount calls "${name}", which this runtime does not have.`);
	}

	reader.at += 1;

	const base = readSum(reader);

	expect(reader, ",", "pow takes a base and an exponent.");

	const exponent = readSum(reader);

	expect(reader, ")", "This amount opens a bracket it never closes.");

	if (exponent < 0n) {
		throw new Refusal("pow was given a negative exponent, which has no whole answer.");
	}

	if (exponent > 63n) {
		throw new Refusal("pow was given an exponent beyond the 64-bit range.");
	}

	return bounded(base ** exponent);
}

function readReference(reader: Reader, token: Token): bigint {
	const count = asInteger(resolveReference(token.text, reader.site, reader.scope).value);

	if (count === undefined) {
		throw new Refusal(`"${token.text}" is not a number, so it cannot be part of an amount.`);
	}

	return bounded(count);
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

function bounded(value: bigint): bigint {
	if (value > I64_MAX || value < I64_MIN) {
		throw new Refusal("This amount leaves the 64-bit range these numbers are held in.");
	}

	return value;
}
