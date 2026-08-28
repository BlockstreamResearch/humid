import { asArray, asRecord } from "../document/json";
import type { NormalisationNote, NormalisedAction } from "../document/normalise";
import { type ReferenceScope, resolveReference } from "../document/references";
import { evaluateExpression } from "./evaluate";

/** What an action says about one of its inputs beyond where the money comes from. */
export type InputRule = {
	/** The manifest's id for the input, so a refusal can name it. */
	id: string;
	/**
	 * The address the wallet must fund this input from, when the action pins one.
	 *
	 * A protocol that requires a specific address is usually requiring a specific key — the
	 * borrower's, in the one manifest that uses this — and funding it from any output the
	 * wallet happens to hold produces a transaction the protocol did not ask for.
	 */
	fromAddress?: string;
	/**
	 * The relative timelock this input must carry.
	 *
	 * A covenant can require one, and the chain rather than the wallet rejects a transaction
	 * built without it. Dropping the declaration silently fails late and unexplainably.
	 */
	sequence?: number;
};

export type InputRulesResult = { ok: false; reason: string } | { ok: true; rules: InputRule[] };

/** BIP68 gives sixteen bits to a relative-blocks count; a larger one is not expressible. */
const MAX_RELATIVE_BLOCKS = 0xff_ff;

/**
 * Reads what an action requires of each input beyond its source.
 *
 * Both of these change what the transaction is rather than how it looks, so a declaration
 * the runtime cannot resolve is a refusal rather than a default — a sequence dropped or an
 * address ignored produces a transaction the protocol did not ask for and the chain or the
 * covenant rejects it somewhere far from the cause.
 */
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
			const address = resolveFromAddress(input.from_address, scope, notes);

			if (!address.ok) {
				return { ok: false, reason: `Input ${id}: ${address.reason}` };
			}

			rule.fromAddress = address.value;
		}

		rules.push(rule);
	}

	return { ok: true, rules };
}

/**
 * A sequence is a bare number or a relative-blocks count, and the two mean different things.
 *
 * A bare number is the sequence field itself, which is how the corpus disables replaceability
 * — `4294967294`. `{relative_blocks: n}` is a timelock, and BIP68 puts the count in the low
 * sixteen bits with the type bit clear, so a count that does not fit there cannot be asked
 * for at all rather than being truncated into a different timelock.
 */
function resolveSequence(
	declared: unknown,
	scope: ReferenceScope,
	notes?: NormalisationNote[],
): { ok: false; reason: string } | { ok: true; value: number } {
	if (typeof declared === "number" && Number.isInteger(declared) && declared >= 0) {
		return { ok: true, value: declared };
	}

	const relative = asRecord(declared)?.relative_blocks;

	if (relative === undefined) {
		return {
			ok: false,
			reason: "its sequence is neither a number nor a relative-blocks count.",
		};
	}

	const blocks =
		typeof relative === "number"
			? { ok: true as const, value: BigInt(relative) }
			: evaluateExpression(String(relative), "amount", scope, notes);

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

/** The address an input must be funded from, which every real use of this states by reference. */
function resolveFromAddress(
	declared: unknown,
	scope: ReferenceScope,
	notes?: NormalisationNote[],
): { ok: false; reason: string } | { ok: true; value: string } {
	if (typeof declared !== "string") {
		return { ok: false, reason: "its from_address is not an address or a reference to one." };
	}

	const found = resolveReference(declared, "witnessKey", scope, notes);

	if (!found.ok) {
		return { ok: false, reason: found.reason };
	}

	return typeof found.value === "string"
		? { ok: true, value: found.value }
		: { ok: false, reason: `${declared} is not an address.` };
}

/** BIP68's disable bit. A sequence at or above it imposes no relative timelock. */
const SEQUENCE_TIMELOCK_DISABLED_FROM = 0x8000_0000;

export type TransactionSequenceResult =
	| { ok: false; reason: string }
	| { ok: true; value: number | undefined };

/**
 * The one sequence this transaction can carry, out of what its inputs declare.
 *
 * The signing module takes a sequence for the transaction and writes it onto every input
 * that declares none, so a per-input sequence is not expressible: whatever is carried lands
 * on the wallet's own funding inputs too. Two declarations that disagree cannot both be
 * honoured, and dropping either builds a transaction the protocol did not ask for.
 *
 * A relative timelock cannot be carried at all. BIP68 measures one against the age of the
 * input it sits on, so putting an action's timelock onto an output the wallet has just
 * received makes the transaction invalid until that output has aged as well — a different
 * transaction from the one declared, failing on broadcast rather than here.
 *
 * A sequence with the disable bit set constrains no input and only enables the transaction's
 * own locktime, which is what every such declaration in the published corpus is for, so that
 * one carries onto every input without changing what any of them require.
 */
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
				`Input ${first.id} asks for sequence ${first.sequence} and input ${disagreeing.id} ` +
				`for ${disagreeing.sequence}. This wallet sets one sequence for the whole ` +
				"transaction and cannot give two inputs different ones.",
		};
	}

	if (first.sequence < SEQUENCE_TIMELOCK_DISABLED_FROM) {
		return {
			ok: false,
			reason:
				`Input ${first.id} asks for a relative timelock, and this wallet sets one sequence ` +
				"for the whole transaction — which would time-lock the outputs funding it as well, " +
				"against their own age rather than this input's.",
		};
	}

	return { ok: true, value: first.sequence };
}
