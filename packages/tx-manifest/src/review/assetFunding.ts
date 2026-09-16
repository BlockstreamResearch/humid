import { byOutpoint, outpointKey } from "../chain/outpoint";
import type { AssetEntry } from "../evaluation/assetLedger";
import { type SelectableUtxo, selectCoins, toSats } from "./coinSelection";

export type AssetHoldings = (asset: string) => SelectableUtxo[];

export type FundedAsset = {
	asset: string;
	changeSats: bigint;
	selected: SelectableUtxo[];
};

export type AssetFundingResult =
	| { funded: FundedAsset[]; ok: true }
	| { ok: false; reason: string; reject: "document-fault" | "shortfall" };

export type AssetFundingContext = {
	feeSats: bigint;
	headroomSats: bigint;
	holdings: AssetHoldings;
	policyAsset: string;
	reserved: { asset: string; utxo: SelectableUtxo }[];
};

export function fundAssets(
	entries: AssetEntry[],
	context: AssetFundingContext,
): AssetFundingResult {
	const policyAsset = context.policyAsset.trim().toLowerCase();
	const funded: FundedAsset[] = [];
	const committed = new Set(context.reserved.map(({ utxo }) => outpointKey(utxo)));

	for (const entry of entries) {
		const isPolicy = entry.asset === policyAsset;
		const reserved = byOutpoint(
			context.reserved.filter((held) => held.asset === entry.asset).map((held) => held.utxo),
		);
		const brought = reserved.reduce((total, utxo) => total + toSats(utxo.amount), entry.held);
		const fee = isPolicy ? context.feeSats : 0n;
		const outstanding = entry.needed + fee - brought;
		let selected = reserved;
		let total = brought;

		if (outstanding > 0n) {
			const pool = context
				.holdings(entry.asset)
				.filter((utxo) => !committed.has(outpointKey(utxo)));
			const selection = selectCoins(pool, outstanding, isPolicy ? context.headroomSats : 0n);

			if (!selection.ok) {
				return {
					ok: false,
					reason: isPolicy ? selection.reason : shortOf(entry.asset, outstanding, pool),
					reject: "shortfall",
				};
			}

			selected = [...reserved, ...selection.selected];
			total = brought + selection.totalSats;
		}

		for (const utxo of selected) {
			committed.add(outpointKey(utxo));
		}

		const surplus = total - entry.needed - fee;

		if (!isPolicy && surplus > 0n && !entry.change) {
			return {
				ok: false,
				reason:
					`This action leaves ${surplus} of ${entry.asset} over, and declares no change ` +
					"output to return it to. Building it would destroy that amount.",
				reject: "document-fault",
			};
		}

		funded.push({
			asset: entry.asset,
			changeSats: isPolicy ? 0n : surplus,
			selected,
		});
	}

	return { funded, ok: true };
}

function shortOf(asset: string, needed: bigint, pool: SelectableUtxo[]): string {
	const usable = byOutpoint(pool.filter((utxo) => utxo.spendable)).reduce(
		(sum, utxo) => sum + toSats(utxo.amount),
		0n,
	);

	return `This action pays ${needed} of ${asset}, and this account holds ${usable} of it.`;
}
