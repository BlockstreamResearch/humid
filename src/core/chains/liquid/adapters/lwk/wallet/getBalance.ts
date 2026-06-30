import type { LiquidWalletAccount } from "../../../application/backends/LiquidWalletBackend";
import { toLiquidAssetId } from "../../../domain/validation";
import { getLwkImplementation } from "./getLwkImplementation";

export function getWalletBalanceForAsset(account: LiquidWalletAccount, rawAssetId: string): string {
	const implementation = getLwkImplementation(account);
	const entries = implementation.wollet.balance().entries();
	const assetId = toLiquidAssetId(account.chainId, rawAssetId);

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

function amountToString(value: unknown): string {
	if (typeof value === "bigint") return value.toString();
	if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value).toString();
	if (typeof value === "string" && /^\d+$/u.test(value)) return value;

	return "0";
}
