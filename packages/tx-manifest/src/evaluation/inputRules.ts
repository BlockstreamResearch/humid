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

const MAX_RELATIVE_BLOCKS = 0xff_ff;

const MAX_SEQUENCE = 0xff_ff_ff_ff;

function wholeCount(value: number): bigint | undefined {
	return Number.isSafeInteger(value) && value >= 0 ? BigInt(value) : undefined;
}

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
	if (typeof declared === "number") {
		if (!Number.isSafeInteger(declared) || declared < 0 || declared > MAX_SEQUENCE) {
			throw new Refusal(
				`its sequence is ${declared}, which is not a number the sequence field holds.`,
			);
		}

		return declared;
	}

	const relative = asRecord(declared)?.relative_blocks;

	if (relative === undefined) {
		throw new Refusal("its sequence is neither a number nor a relative-blocks count.");
	}

	const counted = typeof relative === "number" ? wholeCount(relative) : undefined;

	if (typeof relative === "number" && counted === undefined) {
		throw new Refusal(`it asks to wait ${relative} blocks, which is not a number of blocks.`);
	}

	const blocks = counted ?? evaluateExpression(String(relative), "expression", scope);

	if (blocks < 0n || blocks > BigInt(MAX_RELATIVE_BLOCKS)) {
		throw new Refusal(
			`it asks to wait ${blocks} blocks, which a relative timelock cannot express.`,
		);
	}

	return Number(blocks);
}

function resolveFromAddress(declared: unknown, scope: ReferenceScope): string {
	if (typeof declared !== "string") {
		throw new Refusal("its from_address is not an address or a reference to one.");
	}

	const found = resolveReference(declared, "witnessKey", scope).value;

	if (typeof found !== "string") {
		throw new Refusal(`${declared} is not an address.`);
	}

	return found;
}

const SEQUENCE_TIMELOCK_DISABLED_FROM = 0x8000_0000;

export function transactionSequence(rules: InputRule[]): number | undefined {
	const declared = rules.filter((rule) => rule.sequence !== undefined);
	const first = declared[0];

	if (first?.sequence === undefined) {
		return undefined;
	}

	const disagreeing = declared.find((rule) => rule.sequence !== first.sequence);

	if (disagreeing) {
		throw new Refusal(
			`Input ${first.id} asks for sequence ${first.sequence} and input ${disagreeing.id} for ` +
				`${disagreeing.sequence}. This wallet sets one sequence for the whole transaction and ` +
				"cannot give two inputs different ones.",
			"unimplemented-construct",
		);
	}

	return first.sequence;
}

export type PlacedInputOrigin = { declaredBy?: string };

export function checkRelativeTimelockPlacement(
	sequence: number | undefined,
	rules: InputRule[],
	placed: PlacedInputOrigin[],
): void {
	if (sequence === undefined || sequence >= SEQUENCE_TIMELOCK_DISABLED_FROM) {
		return;
	}

	const asking = rules.filter((rule) => rule.sequence === sequence);
	const asked = new Set(asking.map((rule) => rule.id));
	const inheriting = placed.filter(
		(origin) => origin.declaredBy === undefined || !asked.has(origin.declaredBy),
	);

	if (inheriting.length === 0) {
		return;
	}

	const named = asking[0]?.id ?? "(unnamed)";
	const one = inheriting.length === 1;

	throw new Refusal(
		`Input ${named} asks for a relative timelock (sequence ${sequence}), and this wallet sets ` +
			`one sequence for the whole transaction. ${inheriting.length} other input` +
			`${one ? "" : "s"} would inherit that wait, measured against ${one ? "its" : "their"} own ` +
			`age rather than ${named}'s, so nothing would relay the transaction until every one ` +
			"of them is that old as well.",
		"unimplemented-construct",
	);
}
