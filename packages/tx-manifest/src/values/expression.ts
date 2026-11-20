import { integerOf } from "../chain/integers";
import { Refusal } from "../refusal";

const I64_MAX = 2n ** 63n - 1n;
const I64_MIN = -(2n ** 63n);

const SYMBOLS = new Set(["+", "-", "*", "/", "%", "(", ")", ","]);

type Token = { kind: "name" | "number" | "symbol"; text: string };

export type Resolve = (reference: string) => unknown;

export class Expression {
	readonly #resolve: Resolve;
	readonly #tokens: Token[];
	#at = 0;

	private constructor(tokens: Token[], resolve: Resolve) {
		this.#tokens = tokens;
		this.#resolve = resolve;
	}

	static computes(text: string): boolean {
		return [...text].some((character) => SYMBOLS.has(character));
	}

	static evaluate(text: string, resolve: Resolve): bigint {
		const tokens = tokenise(text);

		if (!tokens) {
			throw unreadable(text);
		}

		const expression = new Expression(tokens, resolve);
		const value = Refusal.amend(
			() => expression.#sum(),
			(reason) => `${reason} The expression was "${text}".`,
		);

		if (expression.#at !== tokens.length) {
			throw unreadable(text);
		}

		return value;
	}

	#peek(): Token | undefined {
		return this.#tokens[this.#at];
	}

	#eat(text: string): boolean {
		if (this.#peek()?.text !== text) {
			return false;
		}

		this.#at += 1;

		return true;
	}

	#expect(text: string, reason: string): void {
		if (!this.#eat(text)) {
			throw new Refusal(reason);
		}
	}

	#sum(): bigint {
		let left = this.#product();

		for (;;) {
			const operator = this.#peek()?.text;

			if (operator !== "+" && operator !== "-") {
				return left;
			}

			this.#at += 1;

			const right = this.#product();

			left = bounded(operator === "+" ? left + right : left - right);
		}
	}

	#product(): bigint {
		let left = this.#unary();

		for (;;) {
			const operator = this.#peek()?.text;

			if (operator !== "*" && operator !== "/" && operator !== "%") {
				return left;
			}

			this.#at += 1;

			const right = this.#unary();

			if (operator !== "*" && right === 0n) {
				throw new Refusal("This amount divides by zero, and no value is the right answer to that.");
			}

			left = bounded(
				operator === "*" ? left * right : operator === "/" ? left / right : left % right,
			);
		}
	}

	#unary(): bigint {
		return this.#eat("-") ? bounded(-this.#unary()) : this.#term();
	}

	#term(): bigint {
		const token = this.#peek();

		if (!token) {
			throw new Refusal("This amount ends where a value was expected.");
		}

		this.#at += 1;

		if (token.text === "(") {
			const inner = this.#sum();

			this.#expect(")", "This amount opens a bracket it never closes.");

			return inner;
		}

		if (token.kind === "number") {
			return bounded(BigInt(token.text));
		}

		if (token.kind !== "name") {
			throw new Refusal(`This amount uses "${token.text}", which is not a value.`);
		}

		return this.#peek()?.text === "(" ? this.#call(token.text) : this.#named(token.text);
	}

	#call(name: string): bigint {
		if (name !== "pow") {
			throw new Refusal(`This amount calls "${name}", which this runtime does not have.`);
		}

		this.#at += 1;

		const base = this.#sum();

		this.#expect(",", "pow takes a base and an exponent.");

		const exponent = this.#sum();

		this.#expect(")", "This amount opens a bracket it never closes.");

		if (exponent < 0n) {
			throw new Refusal("pow was given a negative exponent, which has no whole answer.");
		}

		if (exponent > 63n) {
			throw new Refusal("pow was given an exponent beyond the 64-bit range.");
		}

		return bounded(base ** exponent);
	}

	#named(text: string): bigint {
		const count = integerOf(this.#resolve(text));

		if (count === undefined) {
			throw new Refusal(`"${text}" is not a number, so it cannot be part of an amount.`);
		}

		return bounded(count);
	}
}

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

		const name = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?/.exec(text.slice(at));

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

function unreadable(text: string): Refusal {
	return new Refusal(`"${text}" is not an expression this runtime reads.`);
}

function bounded(value: bigint): bigint {
	if (value > I64_MAX || value < I64_MIN) {
		throw new Refusal("This amount leaves the 64-bit range these numbers are held in.");
	}

	return value;
}
