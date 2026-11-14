import { encodeHex, reverseHex } from "./hex";

export class ByteReader {
	readonly #bytes: Uint8Array;
	#at = 0;

	constructor(bytes: Uint8Array) {
		this.#bytes = bytes;
	}

	get offset(): number {
		return this.#at;
	}

	get remaining(): number {
		return this.#bytes.length - this.#at;
	}

	take(count: number): Uint8Array | undefined {
		if (count < 0 || count > this.remaining) {
			return undefined;
		}

		const taken = this.#bytes.subarray(this.#at, this.#at + count);

		this.#at += count;

		return taken;
	}

	skip(count: number): boolean {
		return this.take(count) !== undefined;
	}

	hex(count: number): string | undefined {
		const taken = this.take(count);

		return taken && encodeHex(taken);
	}

	reversedHex(count: number): string | undefined {
		const forwards = this.hex(count);

		return forwards && reverseHex(forwards);
	}

	uint8(): number | undefined {
		return this.take(1)?.[0];
	}

	uintLittleEndian(count: number): bigint | undefined {
		const taken = this.take(count);

		return taken?.reduceRight((value, byte) => value * 256n + BigInt(byte), 0n);
	}

	hexSince(offset: number): string {
		return encodeHex(this.#bytes.subarray(offset, this.#at));
	}
}
