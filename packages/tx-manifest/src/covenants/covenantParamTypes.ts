import { encodeCompileParam, type EncodeParamResult } from "./paramEncoding";

export type CovenantParamTypes = Record<string, string>;

export type DeclaringContract = {
	declares: CovenantParamTypes;
	source: string;
};

const CONTRACT_TYPES: Record<string, string> = {
	bool: "bool",
	u8: "u8",
	u16: "u16",
	u32: "u32",
	u64: "u64",
};

const UNENCODABLE: Record<string, string> = {
	u256:
		"a thirty-two byte value's byte order is not decided by its width. An asset id is " +
		"committed in the reverse of how it is written and a covenant hash is not, and a " +
		"contract declares both as u256 — so a name, which carries the format's own type, can " +
		"be encoded here and a bare value cannot",
};

export function encodeContractLiteral(
	name: string,
	value: string,
	contract: DeclaringContract,
): EncodeParamResult {
	const declaredType = contract.declares[name];

	if (declaredType === undefined) {
		return {
			ok: false,
			reason:
				`${name} is written as the value "${value}", and ${contract.source} declares no ` +
				"compile parameter of that name to take it.",
		};
	}

	const entry = CONTRACT_TYPES[declaredType];

	if (entry === undefined) {
		const known = UNENCODABLE[declaredType];

		return {
			ok: false,
			reason:
				`${name} is written as the value "${value}", and ${contract.source} declares it ` +
				`${declaredType}, which this runtime does not encode from a value` +
				`${known === undefined ? "" : `: ${known}`}.`,
		};
	}

	const encoded = encodeCompileParam(entry, value, name, "a value");

	if (!encoded.ok) {
		return {
			ok: false,
			reason: `${encoded.reason} That is the type ${contract.source} declares for it.`,
		};
	}

	if (encoded.encoded.type !== declaredType) {
		return {
			ok: false,
			reason:
				`${name} is declared ${declaredType} by ${contract.source}, and this runtime ` +
				`encoded it as ${encoded.encoded.type}.`,
		};
	}

	return encoded;
}
