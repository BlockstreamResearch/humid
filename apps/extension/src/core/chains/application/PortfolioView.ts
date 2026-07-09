/**
 * The popup's display model for a chain's portfolio: the asset rows and one activity entry.
 * Amounts are the RAW base-unit values (bigint) — the originals used for crypto/transfer math —
 * and are formatted to human strings only at render, in the owning chain group's presentation
 * components. Each asset also carries a chain-specific `metadata` blob (mirrors a chain record's
 * `settings`) those components read. Lives in core so those components — which live with their
 * chain under core/chains/<group> — don't reach up into routes for their prop types.
 */
export type PortfolioViewAsset = {
	/** Raw balance in base units; formatted for display at render time. */
	amount: bigint;
	decimals: number;
	id: string;
	metadata: unknown;
	name: string;
	symbol: string;
};

/** One transaction in an asset's history; `amount` is raw base units (absolute), formatted at render. */
export type PortfolioViewActivity = {
	amount: bigint;
	counterparty: string;
	date: string;
	direction: string;
	/** Network fee in raw base units (L-BTC), or null when unknown (e.g. an optimistic pending entry). */
	fee: bigint | null;
	id: string;
	/** "pending" until the tx confirms (no block timestamp yet), then "confirmed". */
	status: "pending" | "confirmed";
	/** Block time (epoch) once confirmed, or null while pending — used to group activity by day. */
	timestamp: number | null;
};

/**
 * An asset's activity history for display: the entries plus load-more paging state. The generic
 * asset screen owns the paging (an on-demand, cursor-paginated query); the chain's `AssetView`
 * renders the rows and wires the load-more control to `onLoadMore`.
 */
export type PortfolioViewActivityFeed = {
	error: boolean;
	hasMore: boolean;
	isLoading: boolean;
	isLoadingMore: boolean;
	items: PortfolioViewActivity[];
	onLoadMore: () => void;
};
