import type { LiquidActivityEntry } from "../../../application/backends/LiquidWalletBackend";
import type { LiquidChainId } from "../../../domain/LiquidChain";
import { toLiquidAssetId } from "../../../domain/validation";
import type { LwkWasmModule } from "../loadLwkWasm";

type LwkWollet = InstanceType<LwkWasmModule["Wollet"]>;

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
				feeSats: walletTx.fee().toString(),
				timestamp: typeof timestamp === "number" ? timestamp : null,
				txid: walletTx.txid().toString(),
			} satisfies LiquidActivityEntry,
		];
	});

	return entries.toSorted(
		(a, b) => (b.timestamp ?? Number.POSITIVE_INFINITY) - (a.timestamp ?? Number.POSITIVE_INFINITY),
	);
}

export function readWalletAssetBalances(wollet: LwkWollet): Map<string, bigint> {
	return normalizeBalanceMap(wollet.balance().entries());
}

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
