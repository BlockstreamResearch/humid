import { ArrowLeft01Icon, InformationCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

import type { ChainRecord } from "@/core/chains/application/ChainRecord";
import type { PortfolioViewAsset } from "@/core/chains/application/PortfolioView";
import { chainGroupUis } from "@/routes/App/chainGroupUis";
import { UiDrawer, UiDrawerContent, UiDrawerHeader, UiDrawerTitle } from "@/ui/UiDrawer";

/**
 * Asset header: back to Overview, the asset glyph and name, and an info button that opens the chain
 * group's "About" panel in a drawer. The About content is chain-specific (looked up via
 * `chainGroupUis`), so this generic route header only decides whether to offer the trigger.
 */
export function AssetHeader({ chain, token }: { chain: ChainRecord; token: PortfolioViewAsset }) {
	const [aboutOpen, setAboutOpen] = useState(false);
	const AssetAbout = chainGroupUis[chain.chainGroupId]?.AssetAbout;

	return (
		<header className="border-border/60 flex shrink-0 items-center gap-2 border-b px-2 py-2.5">
			<Link
				to="/app"
				aria-label="Back"
				className="text-muted-foreground hover:bg-accent hover:text-foreground rounded-md p-1.5 transition-colors"
			>
				<HugeiconsIcon icon={ArrowLeft01Icon} size={18} />
			</Link>
			<div className="bg-muted flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold">
				{token.symbol.charAt(0)}
			</div>
			<p className="flex-1 truncate text-sm font-semibold">{token.name}</p>
			{AssetAbout ? (
				<>
					<button
						aria-label="Asset details"
						className="text-muted-foreground hover:bg-accent hover:text-foreground rounded-md p-1.5 transition-colors"
						onClick={() => setAboutOpen(true)}
						type="button"
					>
						<HugeiconsIcon icon={InformationCircleIcon} size={18} />
					</button>
					<UiDrawer onOpenChange={setAboutOpen} open={aboutOpen}>
						<UiDrawerContent className="max-h-[85vh]">
							<UiDrawerHeader className="pb-1 text-left">
								<UiDrawerTitle>{token.name}</UiDrawerTitle>
							</UiDrawerHeader>
							<div className="overflow-y-auto px-4 pb-6">
								<AssetAbout chain={chain} token={token} />
							</div>
						</UiDrawerContent>
					</UiDrawer>
				</>
			) : null}
		</header>
	);
}
