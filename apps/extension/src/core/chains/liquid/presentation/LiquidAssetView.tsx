import { ArrowDownLeft01Icon, ArrowUpRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode } from "react";

import type {
	PortfolioViewActivityFeed,
	PortfolioViewAsset,
} from "@/core/chains/application/PortfolioView";
import { formatUnits } from "@/helpers/formatters";
import { UiSpinner } from "@/ui/UiSpinner";

/** Liquid asset detail body: the balance headline, the account actions, and the tx history. */
export function LiquidAssetView({
	actions,
	activity,
	token,
}: {
	actions: ReactNode;
	activity: PortfolioViewActivityFeed;
	token: PortfolioViewAsset;
}) {
	return (
		<>
			<div className="flex flex-col items-center gap-0.5 py-2">
				<p className="font-mono text-2xl font-semibold tracking-tight">
					{formatUnits(token.amount, token.decimals)} {token.symbol}
				</p>
			</div>
			{actions}
			<LiquidActivityList decimals={token.decimals} feed={activity} symbol={token.symbol} />
		</>
	);
}

/** Liquid transaction history: direction, amount (mono), date, and the (confidential) txid. */
function LiquidActivityList({
	decimals,
	feed,
	symbol,
}: {
	decimals: number;
	feed: PortfolioViewActivityFeed;
	symbol: string;
}) {
	return (
		<div className="flex flex-col gap-1">
			<p className="text-muted-foreground px-1 text-xs font-medium tracking-wide uppercase">
				Activity
			</p>
			<LiquidActivityBody decimals={decimals} feed={feed} symbol={symbol} />
		</div>
	);
}

function LiquidActivityBody({
	decimals,
	feed,
	symbol,
}: {
	decimals: number;
	feed: PortfolioViewActivityFeed;
	symbol: string;
}) {
	if (feed.items.length === 0) {
		if (feed.isLoading) {
			return (
				<div className="text-muted-foreground flex items-center justify-center gap-2 py-6 text-sm">
					<UiSpinner className="size-4" /> Loading…
				</div>
			);
		}

		if (feed.error) {
			return (
				<p className="text-muted-foreground px-1 py-6 text-center text-sm">
					Couldn&apos;t load activity.
				</p>
			);
		}

		return <p className="text-muted-foreground px-1 py-6 text-center text-sm">No activity yet.</p>;
	}

	return (
		<div className="flex flex-col">
			{feed.items.map((item) => {
				const isSent = item.direction === "sent";

				return (
					<div key={item.id} className="flex items-center gap-3 px-1 py-2.5">
						<div className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-full">
							<HugeiconsIcon icon={isSent ? ArrowUpRight01Icon : ArrowDownLeft01Icon} size={16} />
						</div>
						<div className="min-w-0 flex-1">
							<p className="text-sm font-medium capitalize">{item.direction}</p>
							<p className="text-muted-foreground truncate text-xs">
								{item.date} · {isSent ? "To" : "From"}: {item.counterparty}
							</p>
						</div>
						<p className="text-right font-mono text-sm">
							{isSent ? "−" : "+"}
							{formatUnits(item.amount, decimals)} {symbol}
						</p>
					</div>
				);
			})}
			{feed.hasMore ? (
				<button
					className="text-muted-foreground hover:text-foreground mx-auto mt-1 flex items-center gap-1.5 py-2 text-xs font-medium disabled:opacity-60"
					disabled={feed.isLoadingMore}
					onClick={feed.onLoadMore}
					type="button"
				>
					{feed.isLoadingMore ? <UiSpinner className="size-3" /> : null}
					{feed.isLoadingMore ? "Loading…" : "Load more"}
				</button>
			) : null}
		</div>
	);
}
