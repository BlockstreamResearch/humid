import type {
	LiquidActivityEntry,
	LiquidWalletTx,
} from "../../../application/backends/LiquidWalletBackend";
import type { LiquidChainId } from "../../../domain/LiquidChain";
import { toLiquidAssetId } from "../../../domain/validation";
import type { LwkWasmModule } from "../loadLwkWasm";

type LwkWollet = InstanceType<LwkWasmModule["Wollet"]>;

/** One asset's confirmed balance (in sats) from a wollet's `Balance` (its `entries()` is `any`). */
export function readWalletBalanceForAsset(
	wollet: LwkWollet,
	chainId: LiquidChainId,
	rawAssetId: string,
): string {
	const entries = wollet.balance().entries();
	const assetId = toLiquidAssetId(chainId, rawAssetId);

	if (entries instanceof Map) {
		return amountToString(entries.get(rawAssetId) ?? entries.get(assetId));
	}

	if (Array.isArray(entries)) {
		const entry = entries.find(
			(entryValue): entryValue is [unknown, unknown] =>
				Array.isArray(entryValue) && String(entryValue[0]) === rawAssetId,
		);

		return amountToString(entry?.[1]);
	}

	if (typeof entries === "object" && entries !== null) {
		const objectEntries = entries as Record<string, unknown>;

		return amountToString(objectEntries[rawAssetId] ?? objectEntries[assetId]);
	}

	return "0";
}

/**
 * A wollet's transaction history for one asset, newest first (unconfirmed on top).
 * Direction and amount come from each transaction's net balance for that asset
 * (negative = sent). Confidential Liquid has no visible counterparty, so callers key
 * display off the txid.
 */
export function readWalletActivityForAsset(
	wollet: LwkWollet,
	rawAssetId: string,
): LiquidActivityEntry[] {
	const entries = wollet.transactions().flatMap((walletTx) => {
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

/** Every asset balance the wollet holds, raw as (asset id hex → base-unit amount). */
export function readWalletAssetBalances(wollet: LwkWollet): Map<string, bigint> {
	return normalizeBalanceMap(wollet.balance().entries());
}

/**
 * The full transaction history with each tx's signed per-asset deltas (negative = sent),
 * newest first. A single tx can touch several assets (e.g. a swap), so deltas is a list.
 * `wollet.transactions()` is already ordered height-descending with unconfirmed on top.
 */
export function readWalletTransactions(wollet: LwkWollet): LiquidWalletTx[] {
	return wollet.transactions().map((walletTx) => {
		const timestamp = walletTx.timestamp();

		return {
			deltas: [...normalizeBalanceMap(walletTx.balance().entries())]
				.filter(([, sats]) => sats !== 0n)
				.map(([rawAssetId, sats]) => ({ amountSats: sats.toString(), rawAssetId })),
			feeSats: toBigInt(walletTx.fee()).toString(),
			timestamp: typeof timestamp === "number" ? timestamp : null,
			txid: walletTx.txid().toString(),
		} satisfies LiquidWalletTx;
	});
}

/** Normalize LWK's `Balance.entries()` (documented as a Map; defended against variants). */
function normalizeBalanceMap(entries: unknown): Map<string, bigint> {
	const result = new Map<string, bigint>();

	if (entries instanceof Map) {
		for (const [key, value] of entries) result.set(String(key), toBigInt(value));
	} else if (Array.isArray(entries)) {
		for (const pair of entries) {
			if (Array.isArray(pair)) result.set(String(pair[0]), toBigInt(pair[1]));
		}
	} else if (typeof entries === "object" && entries !== null) {
		for (const [key, value] of Object.entries(entries)) result.set(key, toBigInt(value));
	}

	return result;
}

function amountToString(value: unknown): string {
	if (typeof value === "bigint") return value.toString();
	if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value).toString();
	if (typeof value === "string" && /^\d+$/u.test(value)) return value;

	return "0";
}

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
