import { evaluateExpression } from "./evaluate";
import { asArray, asRecord } from "./json";
import type { NormalisationNote, NormalisedAction } from "./normalise";
import { type ReferenceScope, resolveReference } from "./references";

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
