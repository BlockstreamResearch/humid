import { asArray, asRecord } from "../document/json";
import type { NormalisationNote } from "../document/normalise";
import { type ReferenceScope, resolveReference } from "../document/references";

/**
 * A concrete amount the wallet worked out for one of the action's outputs.
 *
 * Amounts stay base units end to end and never become `number`: a satoshi count above
 * 2^53 is representable in a transaction and not in a double.
 */
export type PlannedOutput = {
	/** The manifest's id for this output, for anything that has to name it. */
	id: string;
	/** Absent for change, whose amount is whatever is left after the fee. */
	sats?: bigint;
	/** Where it pays: a covenant type the wallet derived, the wallet, or change. */
	target: { kind: "change" } | { kind: "covenant"; utxoType: string } | { kind: "wallet" };
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
	action: Record<string, unknown>,
	scope: ReferenceScope,
	notes?: NormalisationNote[],
): PlanResult {
	const outputs: PlannedOutput[] = [];
	let fundingSats = 0n;

	for (const declared of asArray(action.outputs)) {
		const output = asRecord(declared);

		if (!output) {
			continue;
		}

		const id = typeof output.id === "string" ? output.id : "";
		const target = resolveTarget(output.destination);

		if (!target) {
			return {
				ok: false,
				reason: `Output ${id || "(unnamed)"} pays somewhere this runtime does not resolve yet.`,
			};
		}

		if (target.kind === "change") {
			outputs.push({ id, target });

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
		outputs.push({ id, sats: amount, target });
	}

	if (outputs.length === 0) {
		return { ok: false, reason: "The action declares no outputs." };
	}

	return { ok: true, plan: { fundingSats, outputs } };
}

function resolveTarget(destination: unknown): PlannedOutput["target"] | undefined {
	if (destination === "change") {
		return { kind: "change" };
	}

	if (destination === "wallet") {
		return { kind: "wallet" };
	}

	const utxoType = asRecord(destination)?.utxo_type;

	return typeof utxoType === "string" ? { kind: "covenant", utxoType } : undefined;
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
