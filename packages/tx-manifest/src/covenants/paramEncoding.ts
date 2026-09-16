type Encoding = "boolean" | "decimal" | "hex" | "reversedHex";

type ParamType = {
	bytes?: number;
	compiler: string;
	encoding: Encoding;
	max?: bigint;
	shape: string;
};

const PARAM_TYPES: Record<string, ParamType> = {
	bool: { compiler: "bool", encoding: "boolean", shape: "true or false" },
	bytes32: {
		bytes: 32,
		compiler: "u256",
		encoding: "hex",
		shape: "32 bytes as 64 hexadecimal characters",
	},
	"liquid.asset_id": {
		bytes: 32,
		compiler: "u256",
		encoding: "reversedHex",
		shape: "an asset id: 32 bytes as 64 hexadecimal characters",
	},
	pubkey: {
		bytes: 32,
		compiler: "Pubkey",
		encoding: "hex",
		shape: "an x-only public key: 32 bytes as 64 hexadecimal characters, no prefix and no address",
	},
	u8: { compiler: "u8", encoding: "decimal", max: 255n, shape: "a whole number from 0 to 255" },
	u16: {
		compiler: "u16",
		encoding: "decimal",
		max: 65_535n,
		shape: "a whole number from 0 to 65535",
	},
	u32: {
		compiler: "u32",
		encoding: "decimal",
		max: 4_294_967_295n,
		shape: "a whole number from 0 to 4294967295",
	},
	u64: {
		compiler: "u64",
		encoding: "decimal",
		max: 18_446_744_073_709_551_615n,
		shape: "a whole number from 0 to 18446744073709551615",
	},
};

const UNENCODABLE: Record<string, string> = {
	address:
		"an address is a rendering of a locking script rather than a value, and neither the " +
		"format nor the compiler says which of the two a contract is meant to be built with",
	bytes:
		"a value of this type carries no width, and the compiler needs an exact one — the same " +
		"bytes at two widths are two different covenants",
	string:
		"the compiler has no string type, so there is nothing to encode a run of text into " +
		"without choosing an encoding the format never states",
};

export type EncodedParam = { type: string; value: string };

export type EncodeParamResult = { encoded: EncodedParam; ok: true } | { ok: false; reason: string };

export function encodesDeclaredType(declaredType: string | undefined): boolean {
	return declaredType !== undefined && declaredType in PARAM_TYPES;
}

export function unencodableReason(declaredType: string | undefined): string {
	if (declaredType === undefined) {
		return "is declared as an unstated type, which this runtime does not encode";
	}

	const known = UNENCODABLE[declaredType];

	return known === undefined
		? `is declared as ${declaredType}, which this runtime does not encode yet`
		: `is declared as ${declaredType}, which this runtime does not encode: ${known}`;
}

export function encodeCompileParam(
	declaredType: string,
	value: string,
	name: string,
	reference: string,
): EncodeParamResult {
	const declared = PARAM_TYPES[declaredType];

	if (!declared) {
		return { ok: false, reason: `${reference} ${unencodableReason(declaredType)}.` };
	}

	const wrong = (found: string): EncodeParamResult => ({
		ok: false,
		reason:
			`${name} is wired to ${reference}, declared ${declaredType}, which is ` +
			`${declared.shape}. Got ${found}.`,
	});

	switch (declared.encoding) {
		case "boolean": {
			const literal = BOOLEANS[value.trim().toLowerCase()];

			return literal === undefined
				? wrong(quoted(value))
				: { encoded: { type: declared.compiler, value: literal }, ok: true };
		}

		case "decimal": {
			const digits = value.trim();

			if (!/^\d+$/.test(digits)) {
				return wrong(quoted(value));
			}

			const number = BigInt(digits);

			return number > (declared.max ?? 0n)
				? wrong(`${number}`)
				: { encoded: { type: declared.compiler, value: number.toString(10) }, ok: true };
		}

		case "hex":
		case "reversedHex": {
			const digits = withoutHexPrefix(value.trim());
			const width = declared.bytes ?? 0;

			if (digits.length !== width * 2 || !/^[0-9a-fA-F]+$/.test(digits)) {
				return wrong(
					/^[0-9a-fA-F]*$/.test(digits) ? `${digits.length} hexadecimal characters` : quoted(value),
				);
			}

			const ordered = declared.encoding === "reversedHex" ? reverseBytes(digits) : digits;

			return { encoded: { type: declared.compiler, value: `0x${ordered}` }, ok: true };
		}
	}
}

const BOOLEANS: Record<string, string> = {
	"0": "false",
	"1": "true",
	false: "false",
	true: "true",
};

function withoutHexPrefix(value: string): string {
	return value.startsWith("0x") || value.startsWith("0X") ? value.slice(2) : value;
}

function reverseBytes(hex: string): string {
	return (hex.match(/../g) ?? []).toReversed().join("");
}

function quoted(value: string): string {
	return `"${value.length > 24 ? `${value.slice(0, 24)}…` : value}"`;
}
