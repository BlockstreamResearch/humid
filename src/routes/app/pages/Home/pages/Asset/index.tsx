import { Navigate } from "@tanstack/react-router";

import { UiScrollArea } from "@/ui/UiScrollArea";

import { QuickActions } from "../../components/QuickActions";
import { useHome } from "../../HomeContext";
import { ActivityList } from "./components/ActivityList";
import { AssetHeader } from "./components/AssetHeader";
import { Route } from "./route";

/**
 * Asset tab: an asset opened from the Overview token list. Its own header (back +
 * name + unit price) over a scrolling body — balance headline, actions, and the
 * transaction history. Reads the asset id from the route and the asset from the
 * home context; unknown ids fall back to Overview.
 */
export function AssetPage() {
	const { assetId } = Route.useParams();
	const { portfolio } = useHome();
	const token = portfolio.tokens.find((candidate) => candidate.id === assetId);

	if (!token) return <Navigate replace to="/app" />;

	return (
		<div className="flex size-full min-h-0 flex-col">
			<AssetHeader name={token.name} price={token.price} symbol={token.symbol} />
			<UiScrollArea className="min-h-0 flex-1">
				<div className="flex flex-col gap-6 px-5 py-4">
					<div className="flex flex-col items-center gap-0.5 py-2">
						<p className="font-mono text-2xl font-semibold tracking-tight">
							{token.amount} {token.symbol}
						</p>
						<p className="text-muted-foreground text-sm">{token.fiat}</p>
					</div>
					<QuickActions />
					<ActivityList items={portfolio.activity[token.id] ?? []} symbol={token.symbol} />
				</div>
			</UiScrollArea>
		</div>
	);
}
