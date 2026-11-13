import { asArray, asRecord } from "../document/json";
import type { Action } from "../document/manifest";
import { parseReference, type ReferenceScope, resolveReference } from "../document/references";
import { Refusal } from "../refusal";
import { type BlindingDecision, resolveBlinding } from "./blinding";
import { type BlindingFactors, resolveBlindingFactors } from "./blindingFactors";
import { evaluateExpression } from "./evaluate";
import { encodeMetadataParts } from "./metadataParts";

export type PlannedOutput = {
	blinding: BlindingDecision;
	factors?: BlindingFactors;
	id: string;
	sats?: bigint;
	target:
		| { address: string; kind: "address" }
		| { kind: "change" }
		| { kind: "fee" }
		| { kind: "program"; utxoType: string }
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
			...(target.kind === "program" && output.confidential !== true
				? { unblindable: "program" as const }
				: target.kind === "data"
					? { unblindable: "data" as const }
					: {}),
		});
		const factors =
			output.blinding === undefined
				? {}
				: {
						factors: Refusal.amend(
							() => resolveBlindingFactors(output.blinding, scope),
							(reason) => `${named} ${reason}`,
						),
					};

		if (target.kind === "change" || target.kind === "fee") {
			outputs.push({ blinding, ...factors, id, target });

			continue;
		}

		if (target.kind === "data" && output.amount_sat === undefined) {
			outputs.push({ blinding, ...factors, id, sats: 0n, target });

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
		outputs.push({ blinding, ...factors, id, sats, target });
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

	if (typeof destination === "string") {
		const address = textAt(destination, scope);

		if (typeof address !== "string") {
			throw new Refusal(`pays ${destination}, which does not resolve to an address.`);
		}

		return { address, kind: "address" };
	}

	const record = asRecord(destination);
	const utxoType = record?.utxo_type;

	if (typeof utxoType === "string") {
		return { kind: "program", utxoType };
	}

	if (record?.script_hash !== undefined) {
		const hash =
			typeof record.script_hash === "string" ? textAt(record.script_hash, scope) : undefined;

		if (typeof hash !== "string" || !HASH.test(hash)) {
			throw new Refusal("pays a script_hash that is not 32 bytes of hex.");
		}

		return { hex: `5120${hash.replace(/^0x/, "").toLowerCase()}`, kind: "data" };
	}

	if (record?.type === "fee") {
		return { kind: "fee" };
	}

	if (record?.type !== "op_return" && record?.type !== "burn") {
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

const HASH = /^(0x)?[0-9a-fA-F]{64}$/;

function textAt(text: string, scope: ReferenceScope): unknown {
	const reference = parseReference(text);

	return HASH.test(text) || (reference?.form !== "params" && reference?.form !== "instance")
		? text
		: resolveReference(text, "destination", scope).value;
}

function opReturnScript(payloadHex: string): string {
	const length = payloadHex.length / 2;

	if (length < 0x4c) {
		return `6a${length.toString(16).padStart(2, "0")}${payloadHex}`;
	}

	return `6a4c${length.toString(16).padStart(2, "0")}${payloadHex}`;
}

export function resolveAmount(amount: unknown, scope: ReferenceScope): bigint {
	if (typeof amount === "number" && Number.isSafeInteger(amount)) {
		return BigInt(amount);
	}

	if (typeof amount !== "string") {
		throw new Refusal("the document states no amount this runtime can read.");
	}

	return evaluateExpression(amount, "amount", scope);
}
