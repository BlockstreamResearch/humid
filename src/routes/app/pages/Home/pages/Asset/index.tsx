import { Navigate } from "@tanstack/react-router";

import { chainGroupUis } from "@/routes/App/chainGroupUis";
import { UiScrollArea } from "@/ui/UiScrollArea";

import { QuickActions } from "../../components/QuickActions";
import { useHome } from "../../HomeContext";
import { AssetHeader } from "./components/AssetHeader";
import { Route } from "./route";

/**
 * Asset tab: an asset opened from the Overview token list. Generic chrome — the back/name/price
 * header and the account actions — wraps the selected chain group's `AssetView`, which renders the
 * balance and transaction history however that chain needs. Unknown ids fall back to Overview.
 */
export function AssetPage() {
	const { assetId } = Route.useParams();
	const { chain, portfolio } = useHome();
	const token = portfolio.tokens.find((candidate) => candidate.id === assetId);

	if (!token) return <Navigate replace to="/app" />;

	const AssetView = chainGroupUis[chain.chainGroupId]?.AssetView;

	return (
		<div className="flex size-full min-h-0 flex-col">
			<AssetHeader name={token.name} price={token.price} symbol={token.symbol} />
			<UiScrollArea className="min-h-0 flex-1">
				<div className="flex flex-col gap-6 px-5 py-4">
					{AssetView ? (
						<AssetView
							actions={<QuickActions />}
							activity={portfolio.activity[token.id] ?? []}
							token={token}
						/>
					) : null}
				</div>
			</UiScrollArea>
		</div>
	);
}
