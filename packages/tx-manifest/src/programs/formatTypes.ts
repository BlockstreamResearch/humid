import { decodeHex, encodeHex, reverseHex, withoutHexPrefix } from "../chain/hex";
import { quoted, Refusal } from "../refusal";

type Declared = {
	compiler?: string;
	kind: "boolean" | "bytes" | "integer";
	reversed?: boolean;
	shape: string;
	width?: number;
};

const DECLARED: Record<string, Declared> = {
	bool: { compiler: "bool", kind: "boolean", shape: "true or false", width: 1 },
	bytes: { kind: "bytes", shape: "bytes, as an even number of hexadecimal characters" },
	bytes32: {
		compiler: "u256",
		kind: "bytes",
		shape: "32 bytes as 64 hexadecimal characters",
		width: 32,
	},
	"liquid.asset_id": {
		compiler: "u256",
		kind: "bytes",
		reversed: true,
		shape: "an asset id: 32 bytes as 64 hexadecimal characters",
		width: 32,
	},
	pubkey: {
		compiler: "Pubkey",
		kind: "bytes",
		shape: "an x-only public key: 32 bytes as 64 hexadecimal characters, no prefix and no address",
		width: 32,
	},
	u8: unsigned(1),
	u16: unsigned(2),
	u32: unsigned(4),
	u64: unsigned(8),
};

const UNENCODABLE: Record<string, string> = {
	address:
		"an address is a rendering of a locking script rather than a value, and neither the " +
		"format nor the compiler says which of the two a contract is meant to be built with",
	string:
		"the compiler has no string type, so there is nothing to encode a run of text into " +
		"without choosing an encoding the format never states",
};

const NO_WIDTH =
	"a value of this type carries no width, and the compiler needs an exact one — the same " +
	"bytes at two widths are two different programs";

const BOOLEANS: Record<string, boolean> = { "0": false, "1": true, false: false, true: true };

export type EncodedArgument = { type: string; value: string };

export class FormatType {
	readonly name: string;
	readonly #declared: Declared;

	private constructor(name: string, declared: Declared) {
		this.name = name;
		this.#declared = declared;
	}

	static named(name: string | undefined): FormatType {
		const declared = name === undefined ? undefined : DECLARED[name];

		if (name === undefined || declared === undefined) {
			throw new Refusal(unencodableReason(name));
		}

		return new FormatType(name, declared);
	}

	static ofCompilerType(compiler: string): FormatType {
		const matching = Object.keys(DECLARED).filter((name) => DECLARED[name]?.compiler === compiler);
		const [only] = matching;

		if (only === undefined) {
			throw new Refusal(`${compiler} is not a type this runtime encodes from a value`);
		}

		if (matching.length > 1) {
			throw new Refusal(
				`${matching.join(" and ")} are all ${compiler}, and their bytes are committed in ` +
					"different orders, so a value says which only through a name that declares its type",
			);
		}

		return FormatType.named(only);
	}

	get isInteger(): boolean {
		return this.#declared.kind === "integer";
	}

	get isReversed(): boolean {
		return this.#declared.reversed === true;
	}

	bytes(value: string): Uint8Array {
		const { kind, width = 0 } = this.#declared;
		const text = value.trim();

		if (kind === "boolean") {
			const flag = BOOLEANS[text.toLowerCase()];

			if (flag === undefined) {
				throw this.#wrong(quoted(value));
			}

			return Uint8Array.of(flag ? 1 : 0);
		}

		if (kind === "integer") {
			if (!/^\d+$/.test(text)) {
				throw this.#wrong(quoted(value));
			}

			const number = BigInt(text);

			if (number >= 1n << BigInt(width * 8)) {
				throw this.#wrong(`${number}`);
			}

			return Uint8Array.from({ length: width }, (_, at) =>
				Number((number >> BigInt((width - 1 - at) * 8)) & 0xffn),
			);
		}

		const digits = withoutHexPrefix(text);
		const decoded = decodeHex(digits);

		if (!decoded) {
			throw this.#wrong(
				/^[0-9a-fA-F]*$/.test(digits) ? `${digits.length} hexadecimal characters` : quoted(value),
			);
		}

		if (width > 0 && decoded.length !== width) {
			throw this.#wrong(`${digits.length} hexadecimal characters`);
		}

		return decoded;
	}

	argument(value: string): EncodedArgument {
		const { compiler, kind } = this.#declared;

		if (compiler === undefined) {
			throw new Refusal(
				`${this.name} is not a type this runtime encodes into a program: ${NO_WIDTH}`,
			);
		}

		const bytes = this.bytes(value);
		const hex = encodeHex(bytes);

		if (kind === "boolean") {
			return { type: compiler, value: bytes[0] === 1 ? "true" : "false" };
		}

		if (kind === "integer") {
			return { type: compiler, value: BigInt(`0x${hex}`).toString() };
		}

		return { type: compiler, value: `0x${this.isReversed ? reverseHex(hex) : hex}` };
	}

	#wrong(found: string): Refusal {
		return new Refusal(`${this.name} is ${this.#declared.shape}. Got ${found}.`);
	}
}

export function unencodableReason(name: string | undefined): string {
	if (name === undefined) {
		return "its type is unstated, and this runtime encodes no unstated type";
	}

	const known = UNENCODABLE[name];

	return known === undefined
		? `${name} is a type this runtime does not encode yet`
		: `${name} is not a type this runtime encodes: ${known}`;
}

function unsigned(width: number): Declared {
	return {
		compiler: `u${width * 8}`,
		kind: "integer",
		shape: `a whole number from 0 to ${(1n << BigInt(width * 8)) - 1n}`,
		width,
	};
}
