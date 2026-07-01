import { Link } from "@tanstack/react-router";

import type { PortfolioToken } from "@/routes/App/pages/Home/HomeContext/hooks/usePortfolio";

/** Asset rows. Each row links to its asset page (`/app/asset/$assetId`). */
export function TokenList({ tokens }: { tokens: PortfolioToken[] }) {
	return (
		<div className="flex flex-col gap-1">
			<p className="text-muted-foreground px-1 text-xs font-medium tracking-wide uppercase">
				Tokens
			</p>
			{tokens.length === 0 ? (
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
							<div className="bg-muted flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
								{token.symbol.charAt(0)}
							</div>
							<div className="min-w-0 flex-1">
								<p className="text-sm font-medium">{token.symbol}</p>
								<p className="text-muted-foreground truncate text-xs">{token.name}</p>
							</div>
							<div className="text-right">
								<p className="font-mono text-sm">{token.amount}</p>
								<p className="text-muted-foreground text-xs">{token.fiat}</p>
							</div>
						</Link>
					))}
				</div>
			)}
		</div>
	);
}
