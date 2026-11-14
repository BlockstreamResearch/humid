import type { Unblind } from "@humid/tx-manifest";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { hexToBytes } from "@noble/hashes/utils.js";

import type { LwkWasmModule } from "../loadLwkWasm";

const MASTER_BLINDING_KEY = /slip77\((?<key>[0-9a-f]{64})\)/;

export function walletUnblinder(
	lwk: LwkWasmModule,
	descriptor: string,
	scriptPubKeyHex: string,
): Unblind {
	const master = MASTER_BLINDING_KEY.exec(descriptor)?.groups?.key;

	if (master === undefined) {
		return () => undefined;
	}

	const blindingKey = hmac(sha256, hexToBytes(master), hexToBytes(scriptPubKeyHex));

	return (transactionHex, vout) => {
		const transaction = lwk.Transaction.fromString(transactionHex);
		const output = transaction.output(vout);
		const key = lwk.SecretKey.fromBytes(blindingKey);

		try {
			if (!output?.isPartiallyBlinded()) {
				return undefined;
			}

			const secrets = output.unblind(key);

			return {
				asset: secrets.asset().toString(),
				assetBlindingFactor: secrets.assetBlindingFactor().toString(),
				sats: secrets.value(),
				valueBlindingFactor: secrets.valueBlindingFactor().toString(),
			};
		} catch {
			return undefined;
		} finally {
			key.free();
			output?.free();
			transaction.free();
		}
	};
}
