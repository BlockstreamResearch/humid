export type PortfolioViewAsset = {
	amount: bigint;
	decimals: number;
	id: string;
	metadata: unknown;
	name: string;
	symbol: string;
};

export type PortfolioViewActivity = {
	amount: bigint;
	counterparty: string;
	date: string;
	direction: string;
	fee: bigint | null;
	id: string;
	status: "pending" | "confirmed";
	timestamp: number | null;
};

export type PortfolioViewActivityFeed = {
	error: boolean;
	hasMore: boolean;
	isLoading: boolean;
	isLoadingMore: boolean;
	items: PortfolioViewActivity[];
	onLoadMore: () => void;
};
