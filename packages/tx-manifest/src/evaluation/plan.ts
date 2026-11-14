import { isHash, withoutHexPrefix } from "../chain/hex";
import type { Action, Output } from "../document/manifest";
import { parseReference } from "../document/references";
import { Refusal } from "../refusal";
import type { Scope } from "../values/scope";
import { type BlindingDecision, resolveBlinding } from "./blinding";
import { type BlindingFactors, resolveBlindingFactors } from "./blindingFactors";
import { concatParts, encodeMetadataParts } from "./metadataParts";

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

export function planAction(
	action: Action,
	scope: Scope,
	declaredTypes: Record<string, string> = {},
): PlannedSpend {
	const outputs: PlannedOutput[] = [];
	let fundingSats = 0n;

	for (const output of action.outputs) {
		const id = output.label;
		const named = `Output ${id}`;
		const target = Refusal.amend(
			() => resolveTarget(output, scope, declaredTypes),
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
		const { blinding: declaredFactors } = output;
		const factors =
			declaredFactors === undefined
				? {}
				: {
						factors: Refusal.amend(
							() => resolveBlindingFactors(declaredFactors, scope),
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
	{ data, destination }: Output,
	scope: Scope,
	declaredTypes: Record<string, string>,
): PlannedOutput["target"] {
	switch (destination.kind) {
		case "change":
		case "fee":
		case "wallet": {
			return { kind: destination.kind };
		}

		case "address": {
			const address = textAt(destination.address, scope);

			if (typeof address !== "string") {
				throw new Refusal(`pays ${destination.address}, which does not resolve to an address.`);
			}

			return { address, kind: "address" };
		}

		case "program": {
			return { kind: "program", utxoType: destination.reference.utxo_type };
		}

		case "script_hash": {
			const hash = textAt(destination.hash, scope);

			if (typeof hash !== "string" || !isHash(withoutHexPrefix(hash))) {
				throw new Refusal("pays a script_hash that is not 32 bytes of hex.");
			}

			return { hex: `5120${withoutHexPrefix(hash).toLowerCase()}`, kind: "data" };
		}

		case "burn":
		case "op_return": {
			if (data === undefined) {
				return { hex: "6a", kind: "data" };
			}

			const hex = Refusal.amend(
				() =>
					encodeMetadataParts(
						typeof data === "string" ? concatParts(data, declaredTypes) : data,
						(reference) => scope.reference(reference, "expression"),
					),
				(reason) => `carries data this runtime cannot encode: ${reason}`,
			);

			if (hex.length / 2 > 0xff) {
				throw new Refusal("carries more than 255 bytes of data, which this runtime does not push.");
			}

			return { hex: opReturnScript(hex), kind: "data" };
		}
	}
}

function textAt(text: string, scope: Scope): unknown {
	const reference = parseReference(text);

	return isHash(withoutHexPrefix(text)) ||
		(reference?.form !== "params" && reference?.form !== "instance")
		? text
		: scope.reference(text, "destination");
}

function opReturnScript(payloadHex: string): string {
	const length = payloadHex.length / 2;

	if (length < 0x4c) {
		return `6a${length.toString(16).padStart(2, "0")}${payloadHex}`;
	}

	return `6a4c${length.toString(16).padStart(2, "0")}${payloadHex}`;
}

export function resolveAmount(amount: string | number | undefined, scope: Scope): bigint {
	if (amount === undefined) {
		throw new Refusal("the document states no amount.");
	}

	return scope.integer(amount, "amount");
}
