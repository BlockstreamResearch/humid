import { Link } from "@tanstack/react-router";

import type { PortfolioViewAsset } from "@/core/chains/application/PortfolioView";
import { chainGroupUis } from "@/routes/App/chainGroupUis";
import { useHome } from "@/routes/App/pages/Home/HomeContext";

/**
 * Asset rows. Each row links to its asset page (`/app/asset/$assetId`); the row content itself is
 * rendered by the selected chain group's `TokenRow`, so each chain decides how its assets look.
 */
export function TokenList({ tokens }: { tokens: PortfolioViewAsset[] }) {
	const { chain } = useHome();
	const TokenRow = chainGroupUis[chain.chainGroupId]?.TokenRow;

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
							className="hover:bg-accent flex items-center gap-3 rounded-lg px-1 py-2.5 transition-colors"
						>
							<TokenRow token={token} />
						</Link>
					))}
				</div>
			)}
		</div>
	);
}
