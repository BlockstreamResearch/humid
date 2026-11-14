import { reverseHex } from "../chain/hex";
import { integerOf } from "../chain/integers";
import { asRecord } from "../document/json";
import type { ReferenceScope } from "../document/references";
import { Refusal } from "../refusal";
import { evaluateExpression } from "./evaluate";

export type BlindingFactors = {
	assetBlindingFactor?: string;
	valueBlindingFactor?: string;
};

const SCALAR_LIMIT = 2n ** 256n;

export function resolveBlindingFactors(declared: unknown, scope: ReferenceScope): BlindingFactors {
	const record = asRecord(declared);

	if (!record) {
		throw new Refusal("states blinding factors this wallet cannot read.");
	}

	return {
		...(record.asset_bf === undefined
			? {}
			: { assetBlindingFactor: factorOf(record.asset_bf, "asset_bf", scope) }),
		...(record.value_bf === undefined
			? {}
			: { valueBlindingFactor: factorOf(record.value_bf, "value_bf", scope) }),
	};
}

function factorOf(declared: unknown, name: string, scope: ReferenceScope): string {
	const scalar = Refusal.amend(
		() => scalarOf(declared, scope),
		(reason) => `its ${name} ${reason}`,
	);

	return reverseHex(scalar.toString(16).padStart(64, "0"));
}

function scalarOf(declared: unknown, scope: ReferenceScope): bigint {
	if (typeof declared === "number") {
		const scalar = integerOf(declared);

		if (scalar === undefined || scalar < 0n) {
			throw new Refusal(`is ${declared}, which is not a whole number.`);
		}

		return scalar;
	}

	if (typeof declared !== "string") {
		throw new Refusal("is neither a number nor text.");
	}

	const text = declared.trim();
	const scalar = /^(0x[0-9a-fA-F]{1,64}|\d+)$/.test(text)
		? BigInt(text)
		: evaluateExpression(text, "expression", scope);

	if (scalar < 0n || scalar >= SCALAR_LIMIT) {
		throw new Refusal(`is ${text}, which does not fit in 32 bytes.`);
	}

	return scalar;
}
