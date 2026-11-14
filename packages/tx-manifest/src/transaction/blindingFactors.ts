import { reverseHex } from "../chain/hex";
import type { Blinding } from "../document/schema";
import { Refusal } from "../refusal";
import type { Scope } from "../values/scope";

export type BlindingFactors = {
	assetBlindingFactor?: string;
	valueBlindingFactor?: string;
};

const SCALAR_LIMIT = 2n ** 256n;

export function resolveBlindingFactors(declared: Blinding, scope: Scope): BlindingFactors {
	return {
		...(declared.asset_bf === undefined
			? {}
			: { assetBlindingFactor: factorOf(declared.asset_bf, "asset_bf", scope) }),
		...(declared.value_bf === undefined
			? {}
			: { valueBlindingFactor: factorOf(declared.value_bf, "value_bf", scope) }),
	};
}

function factorOf(declared: string | number, name: string, scope: Scope): string {
	const scalar = Refusal.amend(
		() => scalarOf(declared, scope),
		(reason) => `its ${name} ${reason}`,
	);

	return reverseHex(scalar.toString(16).padStart(64, "0"));
}

function scalarOf(declared: string | number, scope: Scope): bigint {
	const text = String(declared).trim();
	const scalar =
		typeof declared === "string" && /^(0x[0-9a-fA-F]{1,64}|\d+)$/.test(text)
			? BigInt(text)
			: scope.integer(declared, "expression");

	if (scalar < 0n || scalar >= SCALAR_LIMIT) {
		throw new Refusal(`is ${text}, which does not fit in 32 bytes.`);
	}

	return scalar;
}
