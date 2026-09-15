/**
 * What a manifest's declared parameter type encodes to, in the compiler's own argument shape.
 *
 * The list is closed, and it stays closed. A type nobody has mapped is refused by name rather
 * than passed through, because the compiler will accept almost anything shaped like a value and
 * hand back a perfectly valid address for the wrong contract. Nothing here is derived from a
 * type's name or from what a manifest says it means.
 *
 * Two facts from SimplicityHL decide the whole table.
 *
 * A value is parsed as an expression and const-analysed against the declared type. So `0x…` is a
 * hexadecimal literal and a run of digits is a decimal one, and they are different literals
 * rather than two spellings of one.
 *
 * A hexadecimal literal must be exactly the type's width — a string whose length is not
 * `byte_width * 2` is rejected. That is what makes hex safe for the fixed-width types and unsafe
 * for the integers: `0x1000000000000000` is a legal `u64` and is not the number
 * `1000000000000000`.
 */

/** How a value of a declared type is written for the compiler. */
type Encoding = "boolean" | "decimal" | "hex" | "reversedHex";

type ParamType = {
	/** How many bytes the value occupies, for the types that have a fixed width. */
	bytes?: number;
	/** The type name the compiler parses, which is not always the name the manifest uses. */
	compiler: string;
	encoding: Encoding;
	/** How wide the value may be, for the types bounded by a range rather than a width. */
	max?: bigint;
	/** What a value of this type should look like, for a refusal that can be acted on. */
	shape: string;
};

const PARAM_TYPES: Record<string, ParamType> = {
	/** A flag a contract branches on. One word here is a different covenant at a different address. */
	bool: { compiler: "bool", encoding: "boolean", shape: "true or false" },
	/**
	 * A covenant script hash is thirty-two bytes. `u256` rather than one of the compiler's
	 * aliases because they are the same type: `Pubkey`, `Message`, `Scalar` and the rest all
	 * resolve to `U256`, so the encoded value does not depend on which name a contract happens
	 * to use for it.
	 */
	bytes32: {
		bytes: 32,
		compiler: "u256",
		encoding: "hex",
		shape: "32 bytes as 64 hexadecimal characters",
	},
	/**
	 * An asset id is thirty-two bytes and is **written in reverse of how it is committed**.
	 *
	 * This is the one entry in the table where passing the value through would compile, derive an
	 * address, and be wrong. A covenant reads an asset with `jet::input_amount` or
	 * `jet::output_amount` and compares the bits it gets against its baked-in parameter, and what
	 * those jets report is the asset as the transaction commits it — which is the reverse of the
	 * form everything states an id in.
	 *
	 * Everything on this side of the wallet states an id the way a person reads it, so the turn
	 * belongs here, at the one place a stated id becomes committed bytes.
	 */
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
	/**
	 * The integer widths, written as decimal.
	 *
	 * A number is hex-prefixed nowhere here, and that is the point rather than a convention. The
	 * compiler reads `0x…` as a hexadecimal literal of exactly the type's width, so a decimal
	 * amount that happens to be sixteen characters long is a legal `u64` hexadecimal literal
	 * standing for an entirely different number. It compiles, derives an address, and says
	 * nothing.
	 *
	 * The bound is the type's own, so a value too large for the width it was declared at is
	 * refused here naming both, rather than inside the compiler's parser naming a column.
	 */
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

/**
 * Why a declared type this runtime knows of still has no encoding.
 *
 * Kept apart from the table above because these are not gaps to be filled by pattern: each one
 * names something the format has not said, and a refusal that says which is the difference
 * between a person fixing a request and a person guessing at one.
 */
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

/** Whether this runtime can build a contract argument out of a value of that declared type. */
export function encodesDeclaredType(declaredType: string | undefined): boolean {
	return declaredType !== undefined && declaredType in PARAM_TYPES;
}

/**
 * Why a declared type cannot be encoded, in words the person filling the request can act on.
 *
 * A type the format names and this runtime has not mapped is told apart from one nobody has
 * heard of, because they call for different things: the first waits on a decision about what it
 * means, and the second is usually a typo in the document.
 */
export function unencodableReason(declaredType: string | undefined): string {
	if (declaredType === undefined) {
		return "is declared as an unstated type, which this runtime does not encode";
	}

	const known = UNENCODABLE[declaredType];

	return known === undefined
		? `is declared as ${declaredType}, which this runtime does not encode yet`
		: `is declared as ${declaredType}, which this runtime does not encode: ${known}`;
}

/**
 * One compile parameter, in the compiler's argument shape.
 *
 * The refusals say which compile parameter, which reference, what arrived and what was needed,
 * because all four are things the person filling the request can act on and none of them
 * survives into the compiler's own message.
 */
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
			// The compiler reads `true` and `false` and nothing else of this type. The corpus also
			// writes the two as 1 and 0, which are the same two values written as a bit.
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

			// A leading zero is dropped rather than refused: a document writing `0005` means five,
			// and the compiler reads the digits as a number either way.
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

/**
 * The two words the compiler reads, and the two bits the corpus writes for them.
 *
 * Anything else is refused rather than treated as one of them. A value quietly read as `false`
 * is a different covenant, and it is one that compiles.
 */
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
