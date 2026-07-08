import { RefreshIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState } from "react";

import { formatTimeAgo } from "@/helpers/formatters";
import { useHome } from "@/routes/App/pages/Home/HomeContext";
import { usePortfolioRefresh } from "@/routes/App/pages/Home/HomeContext/hooks/usePortfolioRefresh";
import { cn } from "@/theme/utils.ts";
import { UiButton } from "@/ui/UiButton/base";

/** How often to re-tick the "Updated Xm ago" label so it ages without a fresh sync. */
const FRESHNESS_TICK_MS = 30_000;

/**
 * Portfolio freshness row under the balance headline: a relative "Updated Xm ago" label plus a
 * manual refresh button that force-syncs the selected account (bypassing the engine throttle). The
 * button disables and spins while a refresh is in flight, so mashing it can't queue extra scans; the
 * label ticks on an interval so it ages between syncs.
 */
export function PortfolioRefresh() {
	const { accountGroup, chain, portfolio } = useHome();
	const { isRefreshing, refresh } = usePortfolioRefresh({
		accountGroupId: accountGroup.id,
		chainId: chain.id,
	});
	const [now, setNow] = useState(() => Date.now());

	useEffect(() => {
		const id = setInterval(() => setNow(Date.now()), FRESHNESS_TICK_MS);

		return () => clearInterval(id);
	}, []);

	return (
		<div className="text-muted-foreground flex items-center justify-center gap-1.5 text-xs">
			{portfolio.syncedAt !== null ? (
				<span>Updated {formatTimeAgo(portfolio.syncedAt, now)}</span>
			) : null}
			<UiButton
				type="button"
				variant="ghost"
				size="icon-xs"
				aria-label="Refresh balances"
				disabled={isRefreshing}
				onClick={() => {
					if (!isRefreshing) refresh();
				}}
			>
				<HugeiconsIcon icon={RefreshIcon} className={cn(isRefreshing && "animate-spin")} />
			</UiButton>
		</div>
	);
}
