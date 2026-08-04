import type { ParsedLiquidProcessCtParams } from "./types";

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
 * Knowingly minimal: it resolves a literal and a `params.` reference and refuses
 * everything else. The format's amounts can be arithmetic over other outputs, the fee and
 * chain state, and evaluating those is a dependency graph with a fee re-pass — a later
 * slice's whole subject. This exists so the thinnest real action can be built end to end,
 * and it should be deleted when that slice lands rather than extended one form at a time.
 */
export function planAction(
	request: ParsedLiquidProcessCtParams,
	action: Record<string, unknown>,
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

		const amount = resolveAmount(request, output.amount_sat);

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

/** A literal, or a `params.` reference to one. Anything else is refused by the caller. */
function resolveAmount(request: ParsedLiquidProcessCtParams, amount: unknown): bigint | undefined {
	if (typeof amount === "number" && Number.isSafeInteger(amount)) {
		return BigInt(amount);
	}

	if (typeof amount === "string") {
		const literal = /^\d+$/.test(amount) ? BigInt(amount) : undefined;

		if (literal !== undefined) {
			return literal;
		}

		const referenced = /^\$?params\.(?<name>[A-Za-z0-9_]+)$/.exec(amount)?.groups?.name;

		return referenced === undefined
			? undefined
			: resolveAmount(request, request.params[referenced]);
	}

	return undefined;
}

function asArray(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}
