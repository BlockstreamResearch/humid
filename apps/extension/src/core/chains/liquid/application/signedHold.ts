export type HeldCoins = { amountSats: string; rawAssetId: string }[];

export type TransactionNote = { action: string; origin: string };

export type SignedHold = TransactionNote & { holding: HeldCoins };

export function heldCoins(coins: { amount?: string; asset?: string }[]): HeldCoins {
	const sums = new Map<string, bigint>();

	for (const { amount, asset } of coins) {
		if (amount !== undefined && asset !== undefined) {
			sums.set(asset, (sums.get(asset) ?? 0n) + BigInt(amount));
		}
	}

	return [...sums].map(([rawAssetId, amount]) => ({ amountSats: amount.toString(), rawAssetId }));
}
