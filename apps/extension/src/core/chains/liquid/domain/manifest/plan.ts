import { asArray, asRecord } from "./json";
import type { NormalisationNote, NormalisedAction } from "./normalise";
import { type ReferenceScope, resolveReference } from "./references";

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
 * Each amount is one reference or one literal, resolved at the amount site — which accepts
 * the fee, the deployment's fields, the request's parameters and arguments, a bare name and
 * an attribute of a resolved input. What it still cannot do is arithmetic: the format's
 * amounts can be expressions over other outputs, the fee and chain state, and evaluating
 * those is a dependency graph with a fee re-pass, which is the phased-evaluation slice's
 * whole subject. An expression is refused here by name rather than half-resolved.
 */
export function planAction(
	action: NormalisedAction,
	scope: ReferenceScope,
	notes?: NormalisationNote[],
): PlanResult {
	const outputs: PlannedOutput[] = [];
	let fundingSats = 0n;

	for (const declared of asArray(action.node.outputs)) {
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

/**
 * `change` and `wallet` are keywords rather than references, so they are read before the
 * resolver is asked anything — a bare word at a destination site means one of these two,
 * and the site accepts nothing else bare precisely so it cannot mean a parameter by
 * accident.
 */
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

/** A literal, or one reference resolved at the amount site and required to be a count. */
function resolveAmount(
	amount: unknown,
	scope: ReferenceScope,
	notes?: NormalisationNote[],
): bigint | undefined {
	const literal = asCount(amount);

	if (literal !== undefined) {
		return literal;
	}

	if (typeof amount !== "string") {
		return undefined;
	}

	const found = resolveReference(amount, "amount", scope, notes);

	return found.ok ? asCount(found.value) : undefined;
}

function asCount(value: unknown): bigint | undefined {
	if (typeof value === "bigint") {
		return value;
	}

	if (typeof value === "number") {
		return Number.isSafeInteger(value) ? BigInt(value) : undefined;
	}

	return typeof value === "string" && /^\d+$/.test(value) ? BigInt(value) : undefined;
}
