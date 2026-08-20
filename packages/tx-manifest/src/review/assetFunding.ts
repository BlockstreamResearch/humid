import type { AssetEntry } from "../evaluation/assetLedger";
import { type SelectableUtxo, selectCoins, toSats } from "./coinSelection";

/** The wallet's spendable outputs in one asset, asked for by the id the chain knows it as. */
export type AssetHoldings = (asset: string) => SelectableUtxo[];

/** What one asset ended up funded by, and what comes back in it. */
export type FundedAsset = {
	asset: string;
	/**
	 * What returns to the wallet in this asset as an output the wallet builds itself.
	 *
	 * Zero for the asset the network charges its fees in: that surplus is the fee's to take
	 * from, and what is left of it is change the signing module works out from the finished
	 * weight. Every other asset's surplus is exact here, because nothing takes a bite out of it.
	 */
	changeSats: bigint;
	/** The wallet's own outputs paying for this asset, in the order they will be added. */
	selected: SelectableUtxo[];
};

export type AssetFundingResult =
	| { funded: FundedAsset[]; ok: true }
	| { ok: false; reason: string; reject: "document-fault" | "shortfall" };

export type AssetFundingContext = {
	/** What the wallet worked the fee out to be, which only the network's own asset pays. */
	feeSats: bigint;
	/** What selection adds on top for a fee that is not final until the transaction is weighed. */
	headroomSats: bigint;
	holdings: AssetHoldings;
	policyAsset: string;
	/**
	 * Outputs already committed to before funding was worked out, with the asset they are in.
	 *
	 * An issuance derives its asset id from the output its input spends, so that output is
	 * chosen before anything else — and it is an input of this transaction whether or not the
	 * arithmetic below would have picked it. Counting it twice would fund the action twice; not
	 * counting it would fund it once too little.
	 */
	reserved: { asset: string; utxo: SelectableUtxo }[];
};

/**
 * Funds every asset an action moves, each out of what the wallet holds in that asset.
 *
 * The rule is one sentence applied per asset: what the outputs cost, less what the transaction
 * already brings, is what the wallet has to find — and the network's own asset carries the fee
 * on top because the fee is charged in it and in nothing else. A second asset never becomes a
 * second fee.
 *
 * Where an asset comes up short the refusal names it. A person told "you do not have enough" by
 * a wallet holding plenty of money is being told something true about an asset they were not
 * thinking about, and which one it is, is the whole of the answer.
 */
export function fundAssets(
	entries: AssetEntry[],
	context: AssetFundingContext,
): AssetFundingResult {
	const policyAsset = context.policyAsset.trim().toLowerCase();
	const funded: FundedAsset[] = [];

	for (const entry of entries) {
		const isPolicy = entry.asset === policyAsset;
		const reserved = context.reserved
			.filter((held) => held.asset === entry.asset)
			.map((held) => held.utxo);
		const committed = new Set(reserved.map((utxo) => `${utxo.txid}:${utxo.vout}`));
		const brought = reserved.reduce((total, utxo) => total + toSats(utxo.amount), entry.held);
		const fee = isPolicy ? context.feeSats : 0n;
		const outstanding = entry.needed + fee - brought;
		let selected = reserved;
		let total = brought;

		if (outstanding > 0n) {
			// By outpoint rather than by identity: an output already committed to is the same
			// output however many times the wallet describes it, and one spent twice is not a
			// transaction at all.
			const pool = context
				.holdings(entry.asset)
				.filter((utxo) => !committed.has(`${utxo.txid}:${utxo.vout}`));
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

		const surplus = total - entry.needed - fee;

		// The asset the network charges in is the signing module's to balance: it takes the fee
		// out of this surplus and returns what is left. Any other asset has to be balanced here,
		// exactly, and an asset with more coming in than going out and nowhere declared to put
		// the difference is an action this wallet cannot build without destroying value.
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

/**
 * Why the wallet is short of one asset, said in terms of that asset.
 *
 * Written here rather than taken from selection because selection's own sentence names the fee,
 * and the fee is charged in one asset only. Telling someone they cannot pay the fee in a token
 * would be a wallet explaining its refusal with something that was never true.
 */
function shortOf(asset: string, needed: bigint, pool: SelectableUtxo[]): string {
	const usable = pool
		.filter((utxo) => utxo.spendable && !utxo.confidential)
		.reduce((sum, utxo) => sum + toSats(utxo.amount), 0n);
	const withheld = pool
		.filter((utxo) => utxo.spendable && utxo.confidential)
		.reduce((sum, utxo) => sum + toSats(utxo.amount), 0n);

	return (
		`This action pays ${needed} of ${asset}, and this account holds ${usable} of it.` +
		(withheld > 0n
			? ` A further ${withheld} is in confidential outputs, which a contract action cannot spend — send it to this account's unblinded address to use it.`
			: "")
	);
}
