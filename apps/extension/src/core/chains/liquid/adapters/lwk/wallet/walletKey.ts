import { bytesToHex } from "@noble/hashes/utils.js";
import { HDKey } from "@scure/bip32";

const ACCOUNT_KEY = /\](?<key>[tx]pub[1-9A-HJ-NP-Za-km-z]+)\//;

const TESTNET_VERSIONS = { private: 0x04_35_83_94, public: 0x04_35_87_cf };

export function walletKeyOf(descriptor: string, index: number): string {
	const account = ACCOUNT_KEY.exec(descriptor)?.groups?.key;

	if (account === undefined) {
		throw new Error("The account descriptor names no extended public key.");
	}

	const key = HDKey.fromExtendedKey(
		account,
		account.startsWith("tpub") ? TESTNET_VERSIONS : undefined,
	).derive(`m/0/${index}`).publicKey;

	if (!key) {
		throw new Error("The account's extended key derives no public key.");
	}

	return bytesToHex(key.slice(1));
}
