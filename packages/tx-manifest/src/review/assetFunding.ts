import { byOutpoint, outpointKey } from "../chain/outpoint";
import type { AssetEntry } from "../evaluation/assetLedger";
import { type SelectableUtxo, selectCoins, toSats, withheldSentence } from "./coinSelection";

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
	/**
	 * Every output this transaction has already committed to spending, across every asset.
	 *
	 * One set for the whole transaction rather than one per asset, because an outpoint is an
	 * outpoint. A wallet asked what it holds in two assets answers from one snapshot, and
	 * nothing stops it offering the same output in both replies — a mis-labelled holding, a
	 * cache keyed by something other than the asset, a token and the money in one list. Per-
	 * asset sets would each be satisfied, and the transaction would spend that output twice
	 * and count its value twice while doing it.
	 */
	const committed = new Set(context.reserved.map(({ utxo }) => outpointKey(utxo)));

	for (const entry of entries) {
		const isPolicy = entry.asset === policyAsset;
		// One entry per outpoint here too: two descriptions of a reserved output would be
		// counted twice into what the transaction brings and added twice as inputs.
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

		// Committed as this asset finishes rather than at the end, so the next asset's pool is
		// what is genuinely left. An output funding a token cannot also fund the fee.
		for (const utxo of selected) {
			committed.add(outpointKey(utxo));
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
	// Both figures are counted from outputs already reduced to one entry each. A wallet that
	// described an output twice would otherwise be told it holds twice what it holds, in the
	// very sentence explaining that it does not hold enough.
	const distinct = byOutpoint(pool.filter((utxo) => utxo.spendable));
	const usable = distinct
		.filter((utxo) => !utxo.confidential)
		.reduce((sum, utxo) => sum + toSats(utxo.amount), 0n);

	return (
		`This action pays ${needed} of ${asset}, and this account holds ${usable} of it.` +
		withheldSentence(distinct.filter((utxo) => utxo.confidential))
	);
}
