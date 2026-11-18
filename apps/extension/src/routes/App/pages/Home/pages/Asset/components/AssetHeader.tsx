import { InformationCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";

import { PageHeader } from "@/common/Page";
import type { ChainRecord } from "@/core/chains/application/ChainRecord";
import type { PortfolioViewAsset } from "@/core/chains/application/PortfolioView";
import { chainGroupUis } from "@/routes/App/chainGroupUis";
import { UiDrawer, UiDrawerContent, UiDrawerHeader, UiDrawerTitle } from "@/ui/UiDrawer";

export function AssetHeader({ chain, token }: { chain: ChainRecord; token: PortfolioViewAsset }) {
	const [aboutOpen, setAboutOpen] = useState(false);
	const AssetAbout = chainGroupUis[chain.chainGroupId]?.AssetAbout;

	return (
		<PageHeader
			back={{ label: "Back", to: "/app" }}
			title={
				<>
					<div className="bg-muted flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold">
						{token.symbol.charAt(0)}
					</div>
					<h1 className="truncate text-base font-semibold">{token.name}</h1>
				</>
			}
			aside={
				AssetAbout && (
					<>
						<button
							aria-label="Asset details"
							className="text-muted-foreground hover:bg-accent hover:text-foreground -mr-1.5 rounded-md p-1.5 transition-colors"
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
				)
			}
		/>
	);
}
