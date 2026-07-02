/**
 * The popup's display model for a chain's portfolio: a formatted asset row and one activity
 * entry. Chain-agnostic core fields plus a chain-specific `metadata` blob (mirrors a chain
 * record's `settings`) that the owning chain group's presentation components read. Lives in core
 * so those components — which live with their chain under core/chains/<group> — don't reach up
 * into the routes layer for their prop types.
 */
export type PortfolioViewAsset = {
	amount: string;
	fiat: string;
	id: string;
	metadata: unknown;
	name: string;
	price: string;
	symbol: string;
};

/** One transaction in an asset's history, formatted for display. */
export type PortfolioViewActivity = {
	amount: string;
	counterparty: string;
	date: string;
	direction: string;
	fiat: string;
	id: string;
};
