import { asArray, asRecord } from "../document/json";
import type { NormalisationNote, NormalisedAction } from "../document/normalise";
import { type ReferenceScope, resolveReference } from "../document/references";
import { type BlindingDecision, resolveBlinding } from "./blinding";
import { encodeDataParts } from "./encode";
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
		const target = resolveTarget(output.destination, output.data, scope, notes);

		if (!target.ok) {
			return { ok: false, reason: `Output ${id || "(unnamed)"} ${target.reason}` };
		}

		const blinding = resolveBlinding({
			declared: output.confidential,
			documentDefault,
			...(target.target.kind === "covenant"
				? { unblindable: "covenant" as const }
				: target.target.kind === "data"
					? { unblindable: "data" as const }
					: {}),
		});

		if (target.target.kind === "change") {
			outputs.push({ blinding, id, target: target.target });

			continue;
		}

		// An op_return output carries bytes rather than value. It is provably unspendable, so
		// it pays nothing and nothing needs to fund it.
		if (target.target.kind === "data") {
			outputs.push({ blinding, id, sats: 0n, target: target.target });

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
		outputs.push({ blinding, id, sats: amount.sats, target: target.target });
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
function resolveTarget(
	destination: unknown,
	data: unknown,
	scope: ReferenceScope,
	notes?: NormalisationNote[],
): { ok: false; reason: string } | { ok: true; target: PlannedOutput["target"] } {
	if (destination === "change") {
		return { ok: true, target: { kind: "change" } };
	}

	if (destination === "wallet") {
		return { ok: true, target: { kind: "wallet" } };
	}

	const record = asRecord(destination);
	const utxoType = record?.utxo_type;

	if (typeof utxoType === "string") {
		return { ok: true, target: { kind: "covenant", utxoType } };
	}

	if (record?.type !== "op_return") {
		return { ok: false, reason: "pays somewhere this runtime does not resolve yet." };
	}

	// The payload is the output. An op_return with nothing in it says nothing, and a layout
	// the runtime could not encode is one the protocol's own reader will not recognise.
	const encoded = encodeDataParts(data, (reference) => {
		const found = resolveReference(reference, "expression", scope, notes);

		return found.ok ? { ok: true, value: found.value } : { ok: false, reason: found.reason };
	});

	if (!encoded.ok) {
		return { ok: false, reason: `carries data this runtime cannot encode: ${encoded.reason}` };
	}

	return { ok: true, target: { hex: opReturnScript(encoded.hex), kind: "data" } };
}

/**
 * An OP_RETURN script carrying these bytes.
 *
 * `6a` then a push of the payload — a direct push below 76 bytes, `4c` and a length byte up
 * to 255. Longer than that is refused rather than encoded with a wider push, because nothing
 * in the corpus needs one and a push nobody has exercised is a script nobody has checked.
 */
function opReturnScript(payloadHex: string): string {
	const length = payloadHex.length / 2;

	if (length < 0x4c) {
		return `6a${length.toString(16).padStart(2, "0")}${payloadHex}`;
	}

	return `6a4c${length.toString(16).padStart(2, "0")}${payloadHex}`;
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
