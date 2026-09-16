import { RefreshIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState } from "react";

import { formatTimeAgo } from "@/helpers/formatters";
import { useHome } from "@/routes/App/pages/Home/HomeContext";
import { usePortfolioRefresh } from "@/routes/App/pages/Home/HomeContext/hooks/usePortfolioRefresh";
import { cn } from "@/theme/utils.ts";
import { UiButton } from "@/ui/UiButton/base";

const FRESHNESS_TICK_MS = 30_000;

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
