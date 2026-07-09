import {
	AlertCircleIcon,
	CheckmarkBadge01Icon,
	Copy01Icon,
	LinkSquare02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode } from "react";

import type { ChainRecord } from "@/core/chains/application/ChainRecord";
import type { PortfolioViewAsset } from "@/core/chains/application/PortfolioView";
import { truncateMiddle } from "@/helpers/formatters";
import { cn } from "@/theme/utils.ts";
import { UiBadge } from "@/ui/UiBadge";
import { UiButtonVariants } from "@/ui/UiButton/base";
import { UiCopyButton } from "@/ui/UiCopyButton";

import type { LiquidAssetMetadata } from "../domain/LiquidAsset";
import { liquidExplorerAssetUrl } from "./liquidExplorerAssetUrl";

/**
 * A Liquid asset's "About" details — its registry trust signal (verified / unverified + issuer
 * domain), on-chain identity (asset id, decimals), and a link out to the explorer. Rendered as the
 * body of the asset header's drawer, so it's frameless (the drawer supplies the title and frame) and
 * mirrors the tx detail sheet's divided-row list. The native policy asset (L-BTC) is always verified
 * and carries no issuer, so that row is omitted for it.
 */
export function LiquidAssetAbout({
	chain,
	token,
}: {
	chain: ChainRecord;
	token: PortfolioViewAsset;
}) {
	const metadata = token.metadata as LiquidAssetMetadata;
	const explorerUrl = liquidExplorerAssetUrl(chain, token.id);

	return (
		<div className="flex flex-col gap-4">
			<dl className="divide-border/60 flex flex-col divide-y rounded-xl border">
				<AboutRow label="Registry">
					{metadata.verified ? (
						<UiBadge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-500">
							<HugeiconsIcon icon={CheckmarkBadge01Icon} size={12} />
							In registry
						</UiBadge>
					) : (
						<span className="text-muted-foreground inline-flex items-center gap-1 text-xs font-medium">
							<HugeiconsIcon icon={AlertCircleIcon} size={12} />
							Unverified
						</span>
					)}
				</AboutRow>

				<AboutRow label="Asset ID">
					<UiCopyButton
						className="hover:text-foreground text-muted-foreground -my-0.5 flex max-w-full items-center gap-1.5 rounded-md py-0.5 font-mono text-xs transition-colors"
						value={token.id}
					>
						{(copied) => (
							<>
								<span className="truncate">{truncateMiddle(token.id, 8, 8)}</span>
								<HugeiconsIcon
									className={cn("shrink-0", copied && "text-emerald-500")}
									icon={Copy01Icon}
									size={13}
								/>
							</>
						)}
					</UiCopyButton>
				</AboutRow>

				{metadata.issuerDomain ? (
					<AboutRow label="Issuer">
						<span className="truncate font-medium">{metadata.issuerDomain}</span>
					</AboutRow>
				) : null}

				<AboutRow label="Decimals">
					<span className="font-medium">{token.decimals}</span>
				</AboutRow>
			</dl>

			{explorerUrl ? (
				<a
					className={cn(UiButtonVariants({ size: "sm", variant: "outline" }), "w-full")}
					href={explorerUrl}
					rel="noreferrer"
					target="_blank"
				>
					<HugeiconsIcon icon={LinkSquare02Icon} size={16} />
					View asset on explorer
				</a>
			) : null}
		</div>
	);
}

/** One label/value line in the About list: a muted label on the left, the value trailing right. */
function AboutRow({ children, label }: { children: ReactNode; label: string }) {
	return (
		<div className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
			<dt className="text-muted-foreground shrink-0">{label}</dt>
			<dd className="flex min-w-0 items-center justify-end">{children}</dd>
		</div>
	);
}
