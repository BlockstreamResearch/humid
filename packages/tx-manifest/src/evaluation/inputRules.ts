import { integerOf } from "../chain/integers";
import { asArray, asRecord } from "../document/json";
import type { Action } from "../document/manifest";
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
	const rules: InputRule[] = [];

	for (const declared of asArray(action.node.inputs)) {
		const input = asRecord(declared);

		if (!input) {
			continue;
		}

		const id = typeof input.id === "string" ? input.id : "(unnamed)";
		const rule: InputRule = { id };

		Refusal.amend(
			() => {
				if ("sequence" in input) {
					rule.sequence = resolveSequence(input.sequence, scope);
				}

				if ("from_address" in input) {
					rule.fromAddress = resolveFromAddress(input.from_address, scope);
				}
			},
			(reason) => `Input ${id}: ${reason}`,
		);

		rules.push(rule);
	}

	return rules;
}

function resolveSequence(declared: unknown, scope: ReferenceScope): number {
	const relative = asRecord(declared);

	if (relative?.relative_blocks !== undefined) {
		const blocks = wholeCount(relative.relative_blocks, "blocks", scope);

		if (blocks > MAX_RELATIVE_UNITS) {
			throw new Refusal(
				`it asks to wait ${blocks} blocks, which a relative timelock cannot express.`,
			);
		}

		return Number(blocks);
	}

	if (relative?.relative_seconds !== undefined) {
		const seconds = wholeCount(relative.relative_seconds, "seconds", scope);
		const units = (seconds + SECONDS_PER_UNIT - 1n) / SECONDS_PER_UNIT;

		if (units > MAX_RELATIVE_UNITS) {
			throw new Refusal(
				`it asks to wait ${seconds} seconds, which a relative timelock cannot express.`,
			);
		}

		return TIME_BASED | Number(units);
	}

	if (typeof declared !== "number" && typeof declared !== "string") {
		throw new Refusal("its sequence is neither a number nor a relative timelock.");
	}

	const raw = wholeCount(declared, "as its value", scope);

	if (raw > MAX_SEQUENCE) {
		throw new Refusal(`its sequence is ${raw}, which is not a number the sequence field holds.`);
	}

	return Number(raw);
}

function wholeCount(declared: unknown, unit: string, scope: ReferenceScope): bigint {
	const counted =
		typeof declared === "number"
			? integerOf(declared)
			: evaluateExpression(String(declared), "expression", scope);

	if (counted === undefined || counted < 0n) {
		throw new Refusal(
			`its sequence asks for ${String(declared)} ${unit}, which is not a whole number.`,
		);
	}

	return counted;
}

function resolveFromAddress(declared: unknown, scope: ReferenceScope): string {
	if (typeof declared !== "string") {
		throw new Refusal("its from_address is not an address or a reference to one.");
	}

	const found = resolveReference(declared, "witnessKey", scope);

	if (typeof found !== "string") {
		throw new Refusal(`${declared} is not an address.`);
	}

	return found;
}
