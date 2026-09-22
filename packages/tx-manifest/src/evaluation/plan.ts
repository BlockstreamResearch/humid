import { asArray, asRecord } from "../document/json";
import type { NormalisationNote, NormalisedAction } from "../document/normalise";
import { type ReferenceScope, resolveReference } from "../document/references";
import { type BlindingDecision, resolveBlinding } from "./blinding";
import { evaluateExpression } from "./evaluate";
import { encodeMetadataParts } from "./metadataParts";

export type PlannedOutput = {
	blinding: BlindingDecision;
	id: string;
	sats?: bigint;
	target:
		| { kind: "change" }
		| { kind: "covenant"; utxoType: string }
		| { kind: "data"; hex: string }
		| { kind: "wallet" };
};

export type PlannedSpend = {
	fundingSats: bigint;
	outputs: PlannedOutput[];
};

export type PlanResult = { ok: false; reason: string } | { ok: true; plan: PlannedSpend };

export function planAction(
	action: NormalisedAction,
	scope: ReferenceScope,
	notes?: NormalisationNote[],
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
		const resolved = resolveTarget(output.destination, output.data, scope);

		if (!resolved.ok) {
			return { ok: false, reason: `Output ${id || "(unnamed)"} ${resolved.reason}` };
		}

		const target = resolved.target;

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

		if (target.kind === "data" && output.amount_sat === undefined) {
			outputs.push({ blinding, id, sats: 0n, target });

			continue;
		}

		const amount = resolveAmount(output.amount_sat, scope, notes);

		if (!amount.ok) {
			return { ok: false, reason: `Output ${id || "(unnamed)"} cannot be paid: ${amount.reason}` };
		}

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

function resolveTarget(
	destination: unknown,
	data: unknown,
	scope: ReferenceScope,
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

	if (data === undefined) {
		return { ok: true, target: { hex: "6a", kind: "data" } };
	}

	const encoded = encodeMetadataParts(data, (reference) => {
		const found = resolveReference(reference, "expression", scope);

		return found.ok ? { ok: true, value: found.value } : { ok: false, reason: found.reason };
	});

	if (!encoded.ok) {
		return { ok: false, reason: `carries data this runtime cannot encode: ${encoded.reason}` };
	}

	if (encoded.hex.length / 2 > 0xff) {
		return {
			ok: false,
			reason: "carries more than 255 bytes of data, which this runtime does not push.",
		};
	}

	return { ok: true, target: { hex: opReturnScript(encoded.hex), kind: "data" } };
}

/** `6a` then a direct push below 76 bytes, or `4c` and a length byte up to 255. */
function opReturnScript(payloadHex: string): string {
	const length = payloadHex.length / 2;

	if (length < 0x4c) {
		return `6a${length.toString(16).padStart(2, "0")}${payloadHex}`;
	}

	return `6a4c${length.toString(16).padStart(2, "0")}${payloadHex}`;
}

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
