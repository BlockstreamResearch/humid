import { HDKey } from "@scure/bip32";

const ACCOUNT_KEY = /\](?<key>[tx]pub[1-9A-HJ-NP-Za-km-z]+)\//;

const TESTNET_VERSIONS = { private: 0x04_35_83_94, public: 0x04_35_87_cf };

export function walletKeyOf(descriptor: string): string {
	const account = ACCOUNT_KEY.exec(descriptor)?.groups?.key;
	const key =
		account === undefined
			? undefined
			: HDKey.fromExtendedKey(
					account,
					account.startsWith("tpub") ? TESTNET_VERSIONS : undefined,
				).derive("m/0/0").publicKey;

	if (!key) throw new Error("The wallet descriptor names no extended public key.");

	return Array.from(key.slice(1), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
