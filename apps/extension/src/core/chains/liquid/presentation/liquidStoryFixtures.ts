import type { ChainRecord } from "@/core/chains/application/ChainRecord";
import type {
	PortfolioViewActivity,
	PortfolioViewActivityFeed,
	PortfolioViewAsset,
} from "@/core/chains/application/PortfolioView";
import { truncateMiddle } from "@/helpers/formatters";

import type { LiquidAssetMetadata } from "../domain/LiquidAsset";
import { LIQUID_TESTNET_CHAIN_ID } from "../domain/LiquidChain";

// Shared mock data for the Liquid presentation stories. One module so every story renders the
// exact same chains / tokens / activity, and the values line up with the real display models
// (raw bigint amounts formatted at render, full 64-hex ids, a `metadata` blob that populates the
// whole LiquidAssetMetadata shape the components cast `token.metadata` to).

/** A Liquid testnet chain that exposes an explorer base URL (so "view on explorer" links render). */
export const mockLiquidChain: ChainRecord = {
	chainGroupId: "liquid",
	id: LIQUID_TESTNET_CHAIN_ID,
	name: "Liquid Testnet",
	settings: { explorerUrl: "https://blockstream.info/liquidtestnet" },
};

/** The same chain with no explorer configured — drives the null-explorer variants (no link button). */
export const mockLiquidChainNoExplorer: ChainRecord = {
	chainGroupId: "liquid",
	id: LIQUID_TESTNET_CHAIN_ID,
	name: "Liquid Testnet",
	settings: {},
};

/** The native policy asset (L-BTC): always verified, no issuer. */
export const nativeToken: PortfolioViewAsset = {
	amount: 245_000_000n,
	decimals: 8,
	id: "144c654344aa716d6f3abcc1ca90e5641e4e2a7f633bc09fe3baf64585819a49",
	metadata: { isNative: true, issuerDomain: null, verified: true } satisfies LiquidAssetMetadata,
	name: "Liquid Bitcoin",
	symbol: "L-BTC",
};

/** An issued asset that resolved in the registry: verified, with an issuer domain. */
export const issuedVerifiedToken: PortfolioViewAsset = {
	amount: 42_210_000_000n,
	decimals: 8,
	id: "ce091c998b83c78bb71a632313ba3760f1763d9cfcffae02258ffa9865a37bd2",
	metadata: {
		isNative: false,
		issuerDomain: "tether.to",
		verified: true,
	} satisfies LiquidAssetMetadata,
	name: "Tether USD",
	symbol: "USDt",
};

/** An issued asset that did NOT resolve in the registry: unverified, no issuer, name falls back to the id. */
export const issuedUnverifiedToken: PortfolioViewAsset = {
	amount: 1_500_000n,
	decimals: 2,
	id: "9a8b7c6d5e4fa1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f607183f2c",
	metadata: { isNative: false, issuerDomain: null, verified: false } satisfies LiquidAssetMetadata,
	name: "9a8b…3f2c",
	symbol: "9a8b…3f2c",
};

const SENT_TXID = "d7dac82bea7d3738ba3b3b4d2eeab89dbcc0ad1d6f2a90d3f79f18721a108479";
const RECEIVED_TXID = "a94059e6e943633c1353e9dc247a6f6fb91e393dfdf21e5ba6185a87fc82f8c1";
const PENDING_TXID = "bdc8f312bbbc5555698bc1b8bb4d636f457b355536ed3c51c1c5002389d26d48";

/** A confirmed outgoing transfer, with a known network fee. */
export const confirmedSent: PortfolioViewActivity = {
	amount: 12_500_000n,
	counterparty: truncateMiddle(SENT_TXID),
	date: "May 3, 2026",
	direction: "sent",
	fee: 258n,
	id: SENT_TXID,
	status: "confirmed",
	timestamp: new Date("2026-05-03T00:00:00Z").getTime(),
};

/** A confirmed incoming transfer. */
export const confirmedReceived: PortfolioViewActivity = {
	amount: 8_000_000n,
	counterparty: truncateMiddle(RECEIVED_TXID),
	date: "Apr 28, 2026",
	direction: "received",
	fee: 191n,
	id: RECEIVED_TXID,
	status: "confirmed",
	timestamp: new Date("2026-04-28T00:00:00Z").getTime(),
};

/** An optimistic, just-broadcast send: no block timestamp yet, unknown fee. */
export const pendingSent: PortfolioViewActivity = {
	amount: 5_000_000n,
	counterparty: truncateMiddle(PENDING_TXID),
	date: "Pending",
	direction: "sent",
	fee: null,
	id: PENDING_TXID,
	status: "pending",
	timestamp: null,
};

/**
 * A deterministic 64-hex id derived from a seed, so repeated renders (and pages) keep stable keys.
 * Not cryptographic — it only needs to be well-shaped and unique per seed for the virtualized list.
 */
function hexId(seed: number): string {
	let out = "";
	let state = (seed * 2_654_435_761 + 1) >>> 0;

	for (let i = 0; i < 64; i++) {
		state = (state * 1_664_525 + 1_013_904_223) >>> 0;
		out += (state & 0xf).toString(16);
	}

	return out;
}

const LONG_LIST_BASE_MS = new Date("2026-07-08T00:00:00Z").getTime();

/** A short "MMM D, YYYY" date `i` days before the fixed base — descending as the index grows. */
function descendingDate(i: number): string {
	return new Date(LONG_LIST_BASE_MS - i * 86_400_000).toLocaleDateString("en-US", {
		day: "numeric",
		month: "short",
		year: "numeric",
	});
}

/**
 * A run of `count` varied confirmed activity items (alternating sent/received, descending dates,
 * unique ids), starting at index `start` so successive pages don't collide. Used for the
 * virtualization / load-more story.
 */
export function makeLongItems(count: number, start = 0): PortfolioViewActivity[] {
	return Array.from({ length: count }, (_, offset): PortfolioViewActivity => {
		const index = start + offset;
		const isSent = index % 2 === 0;
		const id = hexId(index + 1);

		return {
			amount: BigInt((index + 1) * 100_000),
			counterparty: truncateMiddle(id),
			date: descendingDate(index),
			direction: isSent ? "sent" : "received",
			fee: isSent ? 258n : 191n,
			id,
			status: "confirmed",
			timestamp: LONG_LIST_BASE_MS - index * 86_400_000,
		};
	});
}

/** Build an activity feed around a set of items; override the paging/loading flags per story. */
export function feed(
	items: PortfolioViewActivity[],
	overrides?: Partial<PortfolioViewActivityFeed>,
): PortfolioViewActivityFeed {
	return {
		error: false,
		hasMore: false,
		isLoading: false,
		isLoadingMore: false,
		items,
		onLoadMore: () => {},
		...overrides,
	};
}
