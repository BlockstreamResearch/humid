import { asArray, asRecord } from "../document/json";
import type { NormalisationNote, NormalisedAction } from "../document/normalise";
import { type ReferenceScope, resolveReference } from "../document/references";
import { evaluateExpression } from "./evaluate";

export type InputRule = {
	id: string;
	fromAddress?: string;
	sequence?: number;
};

export type InputRulesResult = { ok: false; reason: string } | { ok: true; rules: InputRule[] };

const MAX_RELATIVE_BLOCKS = 0xff_ff;

const MAX_SEQUENCE = 0xff_ff_ff_ff;

function wholeCount(value: number): bigint | undefined {
	return Number.isSafeInteger(value) && value >= 0 ? BigInt(value) : undefined;
}

export function resolveInputRules(
	action: NormalisedAction,
	scope: ReferenceScope,
	notes?: NormalisationNote[],
): InputRulesResult {
	const rules: InputRule[] = [];

	for (const declared of asArray(action.node.inputs)) {
		const input = asRecord(declared);

		if (!input) {
			continue;
		}

		const id = typeof input.id === "string" ? input.id : "(unnamed)";
		const rule: InputRule = { id };

		if ("sequence" in input) {
			const sequence = resolveSequence(input.sequence, scope, notes);

			if (!sequence.ok) {
				return { ok: false, reason: `Input ${id}: ${sequence.reason}` };
			}

			rule.sequence = sequence.value;
		}

		if ("from_address" in input) {
			const address = resolveFromAddress(input.from_address, scope);

			if (!address.ok) {
				return { ok: false, reason: `Input ${id}: ${address.reason}` };
			}

			rule.fromAddress = address.value;
		}

		rules.push(rule);
	}

	return { ok: true, rules };
}

function resolveSequence(
	declared: unknown,
	scope: ReferenceScope,
	notes?: NormalisationNote[],
): { ok: false; reason: string } | { ok: true; value: number } {
	if (typeof declared === "number") {
		return Number.isSafeInteger(declared) && declared >= 0 && declared <= MAX_SEQUENCE
			? { ok: true, value: declared }
			: {
					ok: false,
					reason: `its sequence is ${declared}, which is not a number the sequence field holds.`,
				};
	}

	const relative = asRecord(declared)?.relative_blocks;

	if (relative === undefined) {
		return { ok: false, reason: "its sequence is neither a number nor a relative-blocks count." };
	}

	const counted = typeof relative === "number" ? wholeCount(relative) : undefined;

	if (typeof relative === "number" && counted === undefined) {
		return {
			ok: false,
			reason: `it asks to wait ${relative} blocks, which is not a number of blocks.`,
		};
	}

	const blocks =
		counted === undefined
			? evaluateExpression(String(relative), "expression", scope, notes)
			: { ok: true as const, value: counted };

	if (!blocks.ok) {
		return { ok: false, reason: blocks.reason };
	}

	if (blocks.value < 0n || blocks.value > BigInt(MAX_RELATIVE_BLOCKS)) {
		return {
			ok: false,
			reason: `it asks to wait ${blocks.value} blocks, which a relative timelock cannot express.`,
		};
	}

	return { ok: true, value: Number(blocks.value) };
}

function resolveFromAddress(
	declared: unknown,
	scope: ReferenceScope,
): { ok: false; reason: string } | { ok: true; value: string } {
	if (typeof declared !== "string") {
		return { ok: false, reason: "its from_address is not an address or a reference to one." };
	}

	const found = resolveReference(declared, "witnessKey", scope);

	if (!found.ok) {
		return { ok: false, reason: found.reason };
	}

	return typeof found.value === "string"
		? { ok: true, value: found.value }
		: { ok: false, reason: `${declared} is not an address.` };
}

const SEQUENCE_TIMELOCK_DISABLED_FROM = 0x8000_0000;

export type TransactionSequenceResult =
	| { ok: false; reason: string }
	| { ok: true; value: number | undefined };

export function transactionSequence(rules: InputRule[]): TransactionSequenceResult {
	const declared = rules.filter((rule) => rule.sequence !== undefined);
	const first = declared[0];

	if (first?.sequence === undefined) {
		return { ok: true, value: undefined };
	}

	const disagreeing = declared.find((rule) => rule.sequence !== first.sequence);

	if (disagreeing) {
		return {
			ok: false,
			reason:
				`Input ${first.id} asks for sequence ${first.sequence} and input ${disagreeing.id} for ` +
				`${disagreeing.sequence}. This wallet sets one sequence for the whole transaction and ` +
				"cannot give two inputs different ones.",
		};
	}

	return { ok: true, value: first.sequence };
}

export type PlacedInputOrigin = { declaredBy?: string };

export function relativeTimelockPlacement(
	sequence: number | undefined,
	rules: InputRule[],
	placed: PlacedInputOrigin[],
): { ok: false; reason: string } | { ok: true } {
	if (sequence === undefined || sequence >= SEQUENCE_TIMELOCK_DISABLED_FROM) {
		return { ok: true };
	}

	const asking = rules.filter((rule) => rule.sequence === sequence);
	const asked = new Set(asking.map((rule) => rule.id));
	const inheriting = placed.filter(
		(origin) => origin.declaredBy === undefined || !asked.has(origin.declaredBy),
	);

	if (inheriting.length === 0) {
		return { ok: true };
	}

	const named = asking[0]?.id ?? "(unnamed)";
	const one = inheriting.length === 1;

	return {
		ok: false,
		reason:
			`Input ${named} asks for a relative timelock (sequence ${sequence}), and this wallet sets ` +
			`one sequence for the whole transaction. ${inheriting.length} other input` +
			`${one ? "" : "s"} would inherit that wait, measured against ${one ? "its" : "their"} own ` +
			`age rather than ${named}'s, so nothing would relay the transaction until every one ` +
			"of them is that old as well.",
	};
}
