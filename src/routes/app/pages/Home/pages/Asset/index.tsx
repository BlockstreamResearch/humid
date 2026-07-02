import { Navigate } from "@tanstack/react-router";

import type { ChainRecord } from "@/core/chains/application/ChainRecord";
import type { PortfolioViewAsset } from "@/core/chains/application/PortfolioView";
import { chainGroupUis } from "@/routes/App/chainGroupUis";
import { UiScrollArea } from "@/ui/UiScrollArea";

import { QuickActions } from "../../components/QuickActions";
import { useHome } from "../../HomeContext";
import { AssetHeader } from "./components/AssetHeader";
import { Route } from "./route";
import { useActivity } from "./useActivity";

/**
 * Asset tab: an asset opened from the Overview token list. Generic chrome — the back/name header
 * and the account actions — wraps the selected chain group's `AssetView`, which renders the
 * balance and transaction history however that chain needs. Unknown ids fall back to Overview.
 */
export function AssetPage() {
	const { assetId } = Route.useParams();
	const { accountGroup, chain, portfolio } = useHome();
	const token = portfolio.tokens.find((candidate) => candidate.id === assetId);

	if (!token) return <Navigate replace to="/app" />;

	return (
		<AssetContent
			accountGroupId={accountGroup.id}
			chain={chain}
			isSyncing={portfolio.isSyncing}
			token={token}
		/>
	);
}

/**
 * The resolved-asset body. Split out so activity — an on-demand, paginated query keyed by the
 * asset — is fetched with hooks called unconditionally, after the unknown-asset guard above.
 */
function AssetContent({
	accountGroupId,
	chain,
	isSyncing,
	token,
}: {
	accountGroupId: string;
	chain: ChainRecord;
	isSyncing: boolean;
	token: PortfolioViewAsset;
}) {
	const activity = useActivity(token, { accountGroupId, chainId: chain.id, isSyncing });
	const AssetView = chainGroupUis[chain.chainGroupId]?.AssetView;

	return (
		<div className="flex size-full min-h-0 flex-col">
			<AssetHeader name={token.name} symbol={token.symbol} />
			<UiScrollArea className="min-h-0 flex-1">
				<div className="flex flex-col gap-6 px-5 py-4">
					{AssetView ? (
						<AssetView actions={<QuickActions />} activity={activity} token={token} />
					) : null}
				</div>
			</UiScrollArea>
		</div>
	);
}
