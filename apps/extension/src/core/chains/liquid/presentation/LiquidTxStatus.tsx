import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import type { PortfolioViewActivity } from "@/core/chains/application/PortfolioView";
import { UiBadge } from "@/ui/UiBadge";

export function LiquidTxStatusBadge({ status }: { status: PortfolioViewActivity["status"] }) {
	if (status === "pending") {
		return (
			<UiBadge className="bg-amber-500/10 text-amber-600 dark:text-amber-500">
				<span className="size-1.5 animate-pulse rounded-full bg-amber-500" />
				Pending
			</UiBadge>
		);
	}

	return (
		<UiBadge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-500">
			<HugeiconsIcon icon={CheckmarkCircle02Icon} size={12} />
			Confirmed
		</UiBadge>
	);
}
