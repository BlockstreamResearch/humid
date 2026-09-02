import { encodeCompileParam, type EncodeParamResult } from "./paramEncoding";

/**
 * What a contract itself says the types of its compile parameters are.
 *
 * A deployment mostly wires a compile parameter to a name, and the name carries the format's own
 * declared type. Some parameters are wired to a bare value instead — a number, or one of the two
 * words a flag is written as. That position declares nothing, because it is a deployment's
 * wiring rather than a list of parameters, so the value arrives with no type and there is
 * nothing to encode it against.
 *
 * The type still exists. It is just not in the document.
 *
 * **SimplicityHL has no syntax for declaring a parameter's type.** `param::NAME` is written
 * where a value is wanted and the type checker gives it the type that position demands. So a
 * parameter's type is not written down anywhere in the source; it is a result of analysing the
 * source, and the only thing that can state it is the compiler.
 *
 * That is why this takes the types as given rather than reading the contract text. A reader that
 * recovered them from the source would be reimplementing the type checker, and the failure mode
 * of getting one wrong is a value encoded at a width nobody stated.
 */
export type ContractParamTypes = Record<string, string>;

/**
 * A contract, and what it declares — enough to encode a value against and to name in a refusal.
 *
 * The source path is carried because a refusal has to say which contract decided the answer. Two
 * utxo types can wire the same parameter name into different contracts, and "the contract does
 * not take a value there" is only actionable if the reader knows which one is meant.
 */
export type DeclaringContract = {
	declares: ContractParamTypes;
	/** The contract source path, as the document names it. */
	source: string;
};

/**
 * The compiler's own type names, mapped to the encoding entry each one shares.
 *
 * The entry names on the right are the format's declared-type names, and for these five they are
 * spelled identically to the compiler's. That is not relied upon quietly: `encodeContractLiteral`
 * checks that what comes back is typed as the contract asked for, so a mapping that ever stopped
 * lining up would refuse rather than compile something else.
 *
 * The list is closed for the same reason the encoding list is closed.
 */
const CONTRACT_TYPES: Record<string, string> = {
	bool: "bool",
	u8: "u8",
	u16: "u16",
	u32: "u32",
	u64: "u64",
};

/**
 * Why a type a contract really does declare still cannot take a bare value.
 *
 * These are not gaps waiting to be filled in by pattern. Each one names something the position
 * does not say, and a value written there would have to be guessed at rather than read.
 */
const UNENCODABLE: Record<string, string> = {
	u256:
		"a thirty-two byte value's byte order is not decided by its width. An asset id is " +
		"committed in the reverse of how it is written and a covenant hash is not, and a " +
		"contract declares both as u256 — so a name, which carries the format's own type, can " +
		"be encoded here and a bare value cannot",
};

/**
 * One compile parameter written as a bare value, encoded from the type its contract declares.
 *
 * Nothing here looks at the value. `"1"` is not read as a small number, `"false"` is not read as
 * a flag, and a run of sixty-four hexadecimal characters is not read as a hash. The type
 * decides, and where the contract's type does not decide the encoding on its own, this refuses.
 *
 * The refusal names the parameter and the contract, because those are what a person can act on:
 * the document wires a value into a parameter, and the contract is what says whether a value
 * belongs there at all.
 */
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

	// The compiler requires an argument's type to equal its parameter's exactly, so anything
	// typed differently from what the contract declared would be refused there rather than built
	// wrongly. Refusing it here says which parameter and which contract, which the compiler's own
	// message does not.
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
