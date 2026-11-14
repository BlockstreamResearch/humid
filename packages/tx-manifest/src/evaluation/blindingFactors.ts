import { reverseHex } from "../chain/hex";
import { integerOf } from "../chain/integers";
import type { ReferenceScope } from "../document/references";
import type { Blinding } from "../document/schema";
import { Refusal } from "../refusal";
import { evaluateExpression } from "./evaluate";

export type BlindingFactors = {
	assetBlindingFactor?: string;
	valueBlindingFactor?: string;
};

const SCALAR_LIMIT = 2n ** 256n;

export function resolveBlindingFactors(declared: Blinding, scope: ReferenceScope): BlindingFactors {
	return {
		...(declared.asset_bf === undefined
			? {}
			: { assetBlindingFactor: factorOf(declared.asset_bf, "asset_bf", scope) }),
		...(declared.value_bf === undefined
			? {}
			: { valueBlindingFactor: factorOf(declared.value_bf, "value_bf", scope) }),
	};
}

function factorOf(declared: string | number, name: string, scope: ReferenceScope): string {
	const scalar = Refusal.amend(
		() => scalarOf(declared, scope),
		(reason) => `its ${name} ${reason}`,
	);

	return reverseHex(scalar.toString(16).padStart(64, "0"));
}

function scalarOf(declared: string | number, scope: ReferenceScope): bigint {
	if (typeof declared === "number") {
		const scalar = integerOf(declared);

		if (scalar === undefined || scalar < 0n) {
			throw new Refusal(`is ${declared}, which is not a whole number.`);
		}

		return scalar;
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
