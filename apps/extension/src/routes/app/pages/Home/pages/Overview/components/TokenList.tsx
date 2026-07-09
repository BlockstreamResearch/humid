import { Link } from "@tanstack/react-router";
import { useMemo } from "react";

import { usePendingTransfers } from "@/core/accounts/application/pending-transfers/usePendingTransfers";
import type { PortfolioViewAsset } from "@/core/chains/application/PortfolioView";
import { chainGroupUis } from "@/routes/App/chainGroupUis";
import { useHome } from "@/routes/App/pages/Home/HomeContext";

/**
 * Asset rows. Each row links to its asset page (`/app/asset/$assetId`); the row content itself is
 * rendered by the selected chain group's `TokenRow`, so each chain decides how its assets look. A
 * chain-neutral amber dot is overlaid here (not in the chain's row) on any asset with an optimistic
 * pending transfer, so the Overview signals in-flight sends the same way the asset page does.
 */
export function TokenList({ tokens }: { tokens: PortfolioViewAsset[] }) {
	const { accountGroup, chain } = useHome();
	const TokenRow = chainGroupUis[chain.chainGroupId]?.TokenRow;

	// The optimistic pending set for this account+chain — the asset ids with a just-broadcast send that
	// no scan has caught yet. Reading it here keeps the indicator generic across chain groups.
	const pending = usePendingTransfers(accountGroup.id, chain.id);
	const pendingAssetIds = useMemo(
		() => new Set(pending.entries.map((entry) => entry.rawAssetId)),
		[pending.entries],
	);

	return (
		<div className="flex flex-col gap-1">
			<p className="text-muted-foreground px-1 text-xs font-medium tracking-wide uppercase">
				Tokens
			</p>
			{tokens.length === 0 || !TokenRow ? (
				<p className="text-muted-foreground px-1 py-6 text-center text-sm">No tokens yet.</p>
			) : (
				<div className="flex flex-col">
					{tokens.map((token) => (
						<Link
							key={token.id}
							to="/app/asset/$assetId"
							params={{ assetId: token.id }}
							className="hover:bg-accent relative flex items-center gap-3 rounded-lg px-1 py-2.5 transition-colors"
						>
							{pendingAssetIds.has(token.id) ? (
								<>
									<span
										aria-hidden
										className="ring-background pointer-events-none absolute top-1.5 left-8 size-2.5 animate-pulse rounded-full bg-amber-500 ring-2"
										title="Pending transaction"
									/>
									<span className="sr-only">Pending transaction</span>
								</>
							) : null}
							<TokenRow token={token} />
						</Link>
					))}
				</div>
			)}
		</div>
	);
}
