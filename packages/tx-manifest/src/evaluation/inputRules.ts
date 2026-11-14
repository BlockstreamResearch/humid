import { integerOf } from "../chain/integers";
import type { Action, Input } from "../document/manifest";
import { type ReferenceScope, resolveReference } from "../document/references";
import { Refusal } from "../refusal";
import { evaluateExpression } from "./evaluate";

export type InputRule = {
	id: string;
	fromAddress?: string;
	sequence?: number;
};

const MAX_RELATIVE_UNITS = 0xff_ffn;

const MAX_SEQUENCE = 0xff_ff_ff_ffn;

const TIME_BASED = 0x40_00_00;

const SECONDS_PER_UNIT = 512n;

export function resolveInputRules(action: Action, scope: ReferenceScope): InputRule[] {
	return action.inputs.map((input) =>
		Refusal.amend(
			() => ({
				id: input.label,
				...(input.sequence === undefined
					? {}
					: { sequence: resolveSequence(input.sequence, scope) }),
				...(input.from_address === undefined
					? {}
					: { fromAddress: resolveFromAddress(input.from_address, scope) }),
			}),
			(reason) => `Input ${input.label}: ${reason}`,
		),
	);
}

function resolveSequence(declared: NonNullable<Input["sequence"]>, scope: ReferenceScope): number {
	if (typeof declared !== "object") {
		const raw = wholeCount(declared, "as its value", scope);

		if (raw > MAX_SEQUENCE) {
			throw new Refusal(`its sequence is ${raw}, which is not a number the sequence field holds.`);
		}

		return Number(raw);
	}

	if (declared.relative_blocks !== undefined) {
		const blocks = wholeCount(declared.relative_blocks, "blocks", scope);

		if (blocks > MAX_RELATIVE_UNITS) {
			throw new Refusal(
				`it asks to wait ${blocks} blocks, which a relative timelock cannot express.`,
			);
		}

		return Number(blocks);
	}

	if (declared.relative_seconds !== undefined) {
		const seconds = wholeCount(declared.relative_seconds, "seconds", scope);
		const units = (seconds + SECONDS_PER_UNIT - 1n) / SECONDS_PER_UNIT;

		if (units > MAX_RELATIVE_UNITS) {
			throw new Refusal(
				`it asks to wait ${seconds} seconds, which a relative timelock cannot express.`,
			);
		}

		return TIME_BASED | Number(units);
	}

	throw new Refusal("its sequence is neither a number nor a relative timelock.");
}

function wholeCount(declared: string | number, unit: string, scope: ReferenceScope): bigint {
	const counted =
		typeof declared === "number"
			? integerOf(declared)
			: evaluateExpression(declared, "expression", scope);

	if (counted === undefined || counted < 0n) {
		throw new Refusal(
			`its sequence asks for ${String(declared)} ${unit}, which is not a whole number.`,
		);
	}

	return counted;
}

function resolveFromAddress(declared: string, scope: ReferenceScope): string {
	const found = resolveReference(declared, "witnessKey", scope);

	if (typeof found !== "string") {
		throw new Refusal(`${declared} is not an address.`);
	}

	return found;
}
