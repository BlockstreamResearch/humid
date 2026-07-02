import { UiScrollArea } from "@/ui/UiScrollArea";

import { QuickActions } from "../../components/QuickActions";
import { useHome } from "../../HomeContext";
import { BalanceSummary } from "./components/BalanceSummary";
import { HomeHeader } from "./components/HomeHeader";
import { TokenList } from "./components/TokenList";

/**
 * Overview tab (the home landing): a pinned account header over a scrolling body —
 * balance headline, primary actions, and the token list. Portfolio comes from the
 * home context (empty in production until the portfolio backend lands; rich in
 * Storybook via MockHomeProvider).
 */
export function OverviewPage() {
	const { portfolio } = useHome();

	return (
		<div className="flex size-full min-h-0 flex-col">
			<HomeHeader />
			<UiScrollArea className="min-h-0 flex-1">
				<div className="flex flex-col gap-6 px-5 py-4">
					<BalanceSummary
						error={portfolio.error}
						isSyncing={portfolio.isSyncing}
						native={portfolio.native}
						totalFiat={portfolio.totalFiat}
					/>
					<QuickActions />
					<TokenList tokens={portfolio.tokens} />
				</div>
			</UiScrollArea>
		</div>
	);
}
