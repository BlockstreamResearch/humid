import { asArray, asRecord } from "../document/json";
import type { NormalisationNote, NormalisedAction } from "../document/normalise";
import { type ReferenceScope, resolveReference } from "../document/references";
import { type BlindingDecision, resolveBlinding } from "./blinding";

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
 * Knowingly minimal at this stage: it resolves a literal and a reference the amount position
 * accepts — this deployment's fields, the request's parameters and arguments, and a bare name —
 * and refuses everything else by name. The format's amounts can also be arithmetic over other
 * outputs, the fee and chain state, and evaluating those is a dependency graph with a fee
 * re-pass — a later slice's whole subject, which this module grows to take on rather than being
 * replaced by. Until then it refuses loudly instead of falling through, so an amount this cannot
 * evaluate is a refusal naming the output rather than a number nobody chose.
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

		if (amount === undefined) {
			return {
				ok: false,
				reason: `Output ${id || "(unnamed)"} has an amount this runtime does not evaluate yet.`,
			};
		}

		if (amount <= 0n) {
			return { ok: false, reason: `Output ${id || "(unnamed)"} would pay nothing.` };
		}

		fundingSats += amount;
		outputs.push({ blinding, id, sats: amount, target });
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
 * A literal, or a reference to one that the amount position accepts.
 *
 * Recursive by one step on purpose: a reference resolves to whatever was supplied for it, and
 * what was supplied is itself a literal rather than a second reference. A value that resolves to
 * another reference is refused rather than chased, because a chain of them is an evaluation
 * order and that belongs to the slice that owns evaluation.
 */
function resolveAmount(
	amount: unknown,
	scope: ReferenceScope,
	notes?: NormalisationNote[],
): bigint | undefined {
	if (typeof amount === "number" && Number.isSafeInteger(amount)) {
		return BigInt(amount);
	}

	if (typeof amount !== "string") {
		return undefined;
	}

	if (/^\d+$/.test(amount)) {
		return BigInt(amount);
	}

	const found = resolveReference(amount, "amount", scope, notes);

	if (!found.ok) {
		return undefined;
	}

	const value = found.value;

	if (typeof value === "number" && Number.isSafeInteger(value)) {
		return BigInt(value);
	}

	return typeof value === "string" && /^\d+$/.test(value) ? BigInt(value) : undefined;
}
