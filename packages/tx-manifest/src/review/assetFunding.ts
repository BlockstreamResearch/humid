import { byOutpoint, outpointKey } from "../chain/outpoint";
import type { AssetEntry } from "../evaluation/assetLedger";
import { Refusal } from "../refusal";
import { type SelectableUtxo, selectCoins, toSats } from "./coinSelection";

export type AssetHoldings = (asset: string) => SelectableUtxo[];

export type FundedAsset = {
	asset: string;
	changeSats: bigint;
	selected: SelectableUtxo[];
};

export type AssetFundingContext = {
	feeSats: bigint;
	holdings: AssetHoldings;
	mayReturn: (asset: string) => boolean;
	policyAsset: string;
	reserved: { asset: string; utxo: SelectableUtxo }[];
};

export function fundAssets(entries: AssetEntry[], context: AssetFundingContext): FundedAsset[] {
	const funded: FundedAsset[] = [];
	const committed = new Set(context.reserved.map(({ utxo }) => outpointKey(utxo)));

	for (const entry of entries) {
		const isPolicy = entry.asset === context.policyAsset;
		const reserved = byOutpoint(
			context.reserved.filter((held) => held.asset === entry.asset).map((held) => held.utxo),
		);
		const brought = reserved.reduce((total, utxo) => total + toSats(utxo), entry.held);
		const fee = isPolicy ? context.feeSats : 0n;
		const outstanding = entry.needed + fee - brought;
		let selected = reserved;
		let total = brought;

		if (outstanding > 0n) {
			const pool = context
				.holdings(entry.asset)
				.filter((utxo) => !committed.has(outpointKey(utxo)));
			const selection = Refusal.amend(
				() => selectCoins(pool, outstanding),
				(reason) => (isPolicy ? reason : shortOf(entry.asset, outstanding, pool)),
			);

			selected = [...reserved, ...selection.selected];
			total = brought + selection.totalSats;
		}

		for (const utxo of selected) {
			committed.add(outpointKey(utxo));
		}

		const surplus = total - entry.needed - fee;

		if (surplus > 0n && !entry.change && !context.mayReturn(entry.asset)) {
			throw new Refusal(
				`This action leaves ${surplus} of ${entry.asset} over${isPolicy ? " after the fee" : ""}, ` +
					"declares no change output to return it to, and its allow_change does not let " +
					"this wallet add one. Building it would destroy that amount.",
			);
		}

		funded.push({
			asset: entry.asset,
			changeSats: surplus,
			selected,
		});
	}

	return funded;
}

function shortOf(asset: string, needed: bigint, pool: SelectableUtxo[]): string {
	const usable = byOutpoint(pool.filter((utxo) => utxo.spendable)).reduce(
		(sum, utxo) => sum + toSats(utxo),
		0n,
	);

	return `This action pays ${needed} of ${asset}, and this account holds ${usable} of that asset.`;
}
