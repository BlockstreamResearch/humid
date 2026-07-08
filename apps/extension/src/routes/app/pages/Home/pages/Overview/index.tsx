import { UiScrollArea } from "@/ui/UiScrollArea";

import { QuickActions } from "../../components/QuickActions";
import { useHome } from "../../HomeContext";
import { BalanceSummary } from "./components/BalanceSummary";
import { HomeHeader } from "./components/HomeHeader";
import { PortfolioRefresh } from "./components/PortfolioRefresh";
import { TokenList } from "./components/TokenList";

/**
 * Overview tab (the home landing): a pinned account header over a scrolling body —
 * balance headline, primary actions, and the token list. Portfolio comes from the
 * home context (background-backed; rich in Storybook via MockHomeProvider).
 */
export function OverviewPage() {
	const { portfolio } = useHome();

	return (
		<div className="flex size-full flex-col">
			<HomeHeader />
			<UiScrollArea className="min-h-0 flex-1">
				<div className="flex flex-col gap-6 px-5 py-4">
					<div className="flex flex-col gap-2">
						<BalanceSummary
							error={portfolio.error}
							isSyncing={portfolio.isSyncing}
							native={portfolio.native}
						/>
						<PortfolioRefresh />
					</div>
					<QuickActions />
					<TokenList tokens={portfolio.tokens} />
				</div>
			</UiScrollArea>
		</div>
	);
}
