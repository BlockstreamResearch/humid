import { asArray, asRecord } from "../document/json";
import type { NormalisationNote, NormalisedAction } from "../document/normalise";
import type { ReferenceScope } from "../document/references";
import { type BlindingDecision, resolveBlinding } from "./blinding";
import { evaluateExpression } from "./evaluate";

/**
 * A concrete amount the wallet worked out for one of the action's outputs.
 *
 * Amounts stay base units end to end and never become `number`: a satoshi count above
 * 2^53 is representable in a transaction and not in a double.
 */
export type PlannedOutput = {
	/** Whether this output hides what it carries, and whose word decided that. */
	blinding: BlindingDecision;
	/** The manifest's id for this output, for anything that has to name it. */
	id: string;
	/** Absent for change, whose amount is whatever is left after the fee. */
	sats?: bigint;
	/** Where it pays: a covenant type the wallet derived, the wallet, change, or nowhere. */
	target:
		| { kind: "change" }
		| { kind: "covenant"; utxoType: string }
		| { kind: "data"; hex: string }
		| { kind: "wallet" };
};

export type PlannedSpend = {
	/** Base units this action needs the wallet to fund, before the fee. */
	fundingSats: bigint;
	outputs: PlannedOutput[];
};

export type PlanResult = { ok: false; reason: string } | { ok: true; plan: PlannedSpend };

/**
 * Turns the action's declared outputs into concrete amounts.
 *
 * Each amount is a literal or an expression evaluated at the amount site, which accepts this
 * deployment's fields, the request's parameters and arguments, a bare name and an attribute of
 * an input the wallet already resolved. What cannot be evaluated is a refusal naming the output
 * and saying what was wrong with the arithmetic, rather than a number nobody chose.
 */
export function planAction(
	action: NormalisedAction,
	scope: ReferenceScope,
	notes?: NormalisationNote[],
	/** The document's file-level blinding default, which no published manifest states. */
	documentDefault?: unknown,
): PlanResult {
	const outputs: PlannedOutput[] = [];
	let fundingSats = 0n;

	for (const declared of asArray(action.node.outputs)) {
		const output = asRecord(declared);

		if (!output) {
			continue;
		}

		const id = typeof output.id === "string" ? output.id : "";
		const target = resolveTarget(output.destination, output.data);

		if (!target) {
			return {
				ok: false,
				reason: `Output ${id || "(unnamed)"} pays somewhere this runtime does not resolve yet.`,
			};
		}

		// Decided here rather than answered later, because this is the one place that knows an
		// output is the action's own change while the document's word about hiding it is still
		// in hand. The resolver publishes that one and carries the word it set aside; see there
		// for why the trade was made.
		const blinding = resolveBlinding({
			declared: output.confidential,
			documentDefault,
			...(target.kind === "change" ? { change: true } : {}),
			...(target.kind === "covenant"
				? { unblindable: "covenant" as const }
				: target.kind === "data"
					? { unblindable: "data" as const }
					: {}),
		});

		if (target.kind === "change") {
			outputs.push({ blinding, id, target });

			continue;
		}

		// An op_return carries bytes rather than value and almost always pays nothing. A
		// document that states an amount at one is burning it: paying an asset to a provably
		// unspendable output is how a token is destroyed, and there is no other way to do it.
		// Dropping the amount would leave the transaction still holding what the action
		// declared gone, which is a transaction nothing can balance.
		if (target.kind === "data" && output.amount_sat === undefined) {
			outputs.push({ blinding, id, sats: 0n, target });

			continue;
		}

		const amount = resolveAmount(output.amount_sat, scope, notes);

		if (!amount.ok) {
			return { ok: false, reason: `Output ${id || "(unnamed)"} cannot be paid: ${amount.reason}` };
		}

		// The evaluator returns a signed value because an expression may legitimately go negative
		// on the way; an output that lands there pays nothing, and it is refused here, which is
		// where the question is about an amount rather than about arithmetic.
		if (amount.sats <= 0n) {
			return { ok: false, reason: `Output ${id || "(unnamed)"} would pay nothing.` };
		}

		fundingSats += amount.sats;
		outputs.push({ blinding, id, sats: amount.sats, target });
	}

	if (outputs.length === 0) {
		return { ok: false, reason: "The action declares no outputs." };
	}

	return { ok: true, plan: { fundingSats, outputs } };
}

function resolveTarget(destination: unknown, data: unknown): PlannedOutput["target"] | undefined {
	if (destination === "change") {
		return { kind: "change" };
	}

	if (destination === "wallet") {
		return { kind: "wallet" };
	}

	const record = asRecord(destination);
	const utxoType = record?.utxo_type;

	if (typeof utxoType === "string") {
		return { kind: "covenant", utxoType };
	}

	// A burn states no payload at all. The output exists to hold value where nothing can spend
	// it rather than to publish anything, and `6a` on its own is that script: an output whose
	// first opcode is OP_RETURN cannot be spent by anyone, which is the whole of what a burn
	// needs. An op_return that does carry a payload is a published record, and encoding one is
	// a vocabulary of typed parts this slice does not read — so it is refused by name below
	// rather than published as an empty burn that would destroy the value instead.
	return record?.type === "op_return" && data === undefined
		? { hex: "6a", kind: "data" }
		: undefined;
}

/**
 * A literal, a reference the amount position accepts, or arithmetic over either.
 *
 * One reader for all three rather than a fast path for the simple ones: a document writing
 * `"1000"` and one writing `"500 + 500"` are stating the same amount, and two readers is two
 * places for them to stop agreeing.
 */
function resolveAmount(
	amount: unknown,
	scope: ReferenceScope,
	notes?: NormalisationNote[],
): { ok: false; reason: string } | { ok: true; sats: bigint } {
	if (typeof amount === "number" && Number.isSafeInteger(amount)) {
		return { ok: true, sats: BigInt(amount) };
	}

	if (typeof amount !== "string") {
		return { ok: false, reason: "the document states no amount this runtime can read." };
	}

	const evaluated = evaluateExpression(amount, "amount", scope, notes);

	return evaluated.ok ? { ok: true, sats: evaluated.value } : evaluated;
}
