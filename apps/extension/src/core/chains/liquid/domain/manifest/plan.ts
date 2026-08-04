import { evaluateExpression } from "./evaluate";
import { asArray, asRecord } from "./json";
import type { NormalisationNote, NormalisedAction } from "./normalise";
import type { ReferenceScope } from "./references";

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
 * Each amount is a literal or an expression evaluated at the amount site, which accepts the
 * fee, the deployment's fields, the request's parameters and arguments, a bare name and an
 * attribute of a resolved input. `fee` resolves to whatever the scope carries, so planning
 * a draft against a fee of zero and re-planning against an estimate is a matter of calling
 * this twice with different scopes rather than of a second code path.
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

		if (!amount.ok) {
			return {
				ok: false,
				reason: `Output ${id || "(unnamed)"} cannot be paid: ${amount.reason}`,
			};
		}

		// The evaluator returns a signed value because an expression may legitimately go
		// negative on the way; an output that lands there pays nothing and is refused here,
		// which is where the question is about an amount rather than about arithmetic.
		if (amount.sats <= 0n) {
			return { ok: false, reason: `Output ${id || "(unnamed)"} would pay nothing.` };
		}

		fundingSats += amount.sats;
		outputs.push({ id, sats: amount.sats, target });
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

/** A literal, or an expression evaluated at the amount site. */
function resolveAmount(
	amount: unknown,
	scope: ReferenceScope,
	notes?: NormalisationNote[],
): { ok: false; reason: string } | { ok: true; sats: bigint } {
	const literal = asCount(amount);

	if (literal !== undefined) {
		return { ok: true, sats: literal };
	}

	if (typeof amount !== "string") {
		return { ok: false, reason: "its amount is neither a number nor an expression" };
	}

	const evaluated = evaluateExpression(amount, "amount", scope, notes);

	return evaluated.ok
		? { ok: true, sats: evaluated.value }
		: { ok: false, reason: evaluated.reason };
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
