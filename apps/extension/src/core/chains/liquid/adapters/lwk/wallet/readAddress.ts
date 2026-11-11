import type { ReadAddress } from "@humid/tx-manifest";

import type { LwkNetwork } from "../createLwkNetwork";
import type { LwkWasmModule } from "../loadLwkWasm";

const BLECH32 = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

const CHECKSUM_LENGTH = 12;

const BLINDING_KEY_BYTES = 33;

const CONFIDENTIAL_PREFIXES = ["lq1", "tlq1", "el1"];

export function addressReader(lwk: LwkWasmModule, network: LwkNetwork): ReadAddress {
	return (text) => {
		const address = new lwk.Address(text);

		try {
			if (address.isMainnet() !== network.isMainnet()) {
				throw new Error(`${text} is an address of another network.`);
			}

			const script = address.scriptPubkey();
			const scriptPubKeyHex = script.toString();

			script.free();

			return address.isBlinded()
				? { blindingPublicKeyHex: blindingKeyOf(text), scriptPubKeyHex }
				: { scriptPubKeyHex };
		} finally {
			address.free();
		}
	};
}

function blindingKeyOf(address: string): string {
	const lower = address.toLowerCase();

	if (!CONFIDENTIAL_PREFIXES.some((prefix) => lower.startsWith(prefix))) {
		throw new Error(`${address} is a confidential address this wallet reads no blinding key from.`);
	}

	const words = Array.from(lower.slice(lower.lastIndexOf("1") + 1, -CHECKSUM_LENGTH), (char) =>
		BLECH32.indexOf(char),
	).slice(1);
	const bytes: number[] = [];
	let pending = 0;
	let bits = 0;

	for (const word of words) {
		pending = (pending << 5) | word;
		bits += 5;

		if (bits >= 8) {
			bits -= 8;
			bytes.push((pending >> bits) & 0xff);
		}

		pending &= (1 << bits) - 1;
	}

	return bytes
		.slice(0, BLINDING_KEY_BYTES)
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}
