import { Refusal } from "../refusal";
import { encodeCompileParam, type EncodedParam } from "./paramEncoding";

export type ProgramParamTypes = Record<string, string>;

export type DeclaringContract = {
	declares: ProgramParamTypes;
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
		"committed in the reverse of how it is written and a program hash is not, and a " +
		"contract declares both as u256 — so a name, which carries the format's own type, can " +
		"be encoded here and a bare value cannot",
};

export function encodeContractLiteral(
	name: string,
	value: string,
	contract: DeclaringContract,
): EncodedParam {
	const declaredType = contract.declares[name];

	if (declaredType === undefined) {
		throw new Refusal(
			`${name} is written as the value "${value}", and ${contract.source} declares no ` +
				"compile parameter of that name.",
		);
	}

	const entry = CONTRACT_TYPES[declaredType];

	if (entry === undefined) {
		const known = UNENCODABLE[declaredType];

		throw new Refusal(
			`${name} is written as the value "${value}", and ${contract.source} declares it ` +
				`${declaredType}, which this runtime does not encode from a value` +
				`${known === undefined ? "" : `: ${known}`}.`,
		);
	}

	const encoded = Refusal.amend(
		() => encodeCompileParam(entry, value, name, "a value"),
		(reason) => `${reason} That is the type ${contract.source} declares for ${name}.`,
	);

	if (encoded.type !== declaredType) {
		throw new Refusal(
			`${name} is declared ${declaredType} by ${contract.source}, and this runtime ` +
				`encoded it as ${encoded.type}.`,
		);
	}

	return encoded;
}
