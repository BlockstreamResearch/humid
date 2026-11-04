import { asArray, asRecord } from "../document/json";
import type { Action } from "../document/manifest";
import { type ReferenceScope, resolveReference } from "../document/references";
import { Refusal } from "../refusal";
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

export function planAction(action: Action, scope: ReferenceScope): PlannedSpend {
	const outputs: PlannedOutput[] = [];
	let fundingSats = 0n;

	for (const declared of asArray(action.node.outputs)) {
		const output = asRecord(declared);

		if (!output) {
			continue;
		}

		const id = typeof output.id === "string" ? output.id : "";
		const named = `Output ${id || "(unnamed)"}`;
		const target = Refusal.amend(
			() => resolveTarget(output.destination, output.data, scope),
			(reason) => `${named} ${reason}`,
		);

		const blinding = resolveBlinding({
			declared: output.confidential,
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

		const sats = Refusal.amend(
			() => resolveAmount(output.amount_sat, scope),
			(reason) => `${named} cannot be paid: ${reason}`,
		);

		if (sats <= 0n) {
			throw new Refusal(`${named} would pay nothing.`);
		}

		fundingSats += sats;
		outputs.push({ blinding, id, sats, target });
	}

	if (outputs.length === 0) {
		throw new Refusal("The action declares no outputs.");
	}

	return { fundingSats, outputs };
}

function resolveTarget(
	destination: unknown,
	data: unknown,
	scope: ReferenceScope,
): PlannedOutput["target"] {
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

	if (record?.type !== "op_return") {
		throw new Refusal("pays somewhere this runtime does not resolve yet.");
	}

	if (data === undefined) {
		return { hex: "6a", kind: "data" };
	}

	const hex = Refusal.amend(
		() =>
			encodeMetadataParts(
				data,
				(reference) => resolveReference(reference, "expression", scope).value,
			),
		(reason) => `carries data this runtime cannot encode: ${reason}`,
	);

	if (hex.length / 2 > 0xff) {
		throw new Refusal("carries more than 255 bytes of data, which this runtime does not push.");
	}

	return { hex: opReturnScript(hex), kind: "data" };
}

function opReturnScript(payloadHex: string): string {
	const length = payloadHex.length / 2;

	if (length < 0x4c) {
		return `6a${length.toString(16).padStart(2, "0")}${payloadHex}`;
	}

	return `6a4c${length.toString(16).padStart(2, "0")}${payloadHex}`;
}

function resolveAmount(amount: unknown, scope: ReferenceScope): bigint {
	if (typeof amount === "number" && Number.isSafeInteger(amount)) {
		return BigInt(amount);
	}

	if (typeof amount !== "string") {
		throw new Refusal("the document states no amount this runtime can read.");
	}

	return evaluateExpression(amount, "amount", scope);
}
