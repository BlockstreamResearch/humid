import type {
	LiquidActivityEntry,
	LiquidWalletAccount,
} from "../../../application/backends/LiquidWalletBackend";
import { getLwkImplementation } from "./getLwkImplementation";

/**
 * The wallet's transaction history for one asset, newest first (unconfirmed on top).
 * Direction and amount come from the transaction's net balance for that asset
 * (negative = sent). Confidential Liquid has no visible counterparty, so callers key
 * display off the txid.
 */
export function getWalletActivityForAsset(
	account: LiquidWalletAccount,
	rawAssetId: string,
): LiquidActivityEntry[] {
	const implementation = getLwkImplementation(account);

	const entries = implementation.wollet.transactions().flatMap((walletTx) => {
		const net = readSignedAmount(walletTx.balance(), rawAssetId);

		if (net === 0n) return [];

		const timestamp = walletTx.timestamp();

		return [
			{
				amountSats: (net < 0n ? -net : net).toString(),
				direction: net < 0n ? "sent" : "received",
				timestamp: typeof timestamp === "number" ? timestamp : null,
				txid: walletTx.txid().toString(),
			} satisfies LiquidActivityEntry,
		];
	});

	return entries.toSorted(
		(a, b) => (b.timestamp ?? Number.POSITIVE_INFINITY) - (a.timestamp ?? Number.POSITIVE_INFINITY),
	);
}

/** Reads one asset's signed net amount from an LWK `Balance` (its `entries()` is `any`). */
function readSignedAmount(balance: { entries: () => unknown }, rawAssetId: string): bigint {
	const entries = balance.entries();

	if (entries instanceof Map) return toBigInt(entries.get(rawAssetId));

	if (Array.isArray(entries)) {
		const entry = entries.find(
			(candidate): candidate is [unknown, unknown] =>
				Array.isArray(candidate) && String(candidate[0]) === rawAssetId,
		);

		return toBigInt(entry?.[1]);
	}

	if (typeof entries === "object" && entries !== null) {
		return toBigInt((entries as Record<string, unknown>)[rawAssetId]);
	}

	return 0n;
}

function toBigInt(value: unknown): bigint {
	if (typeof value === "bigint") return value;
	if (typeof value === "number" && Number.isFinite(value)) return BigInt(Math.trunc(value));
	if (typeof value === "string" && /^-?\d+$/u.test(value)) return BigInt(value);

	return 0n;
}
