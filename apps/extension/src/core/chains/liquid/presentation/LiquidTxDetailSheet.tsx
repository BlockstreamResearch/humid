import {
	ArrowDownLeft01Icon,
	ArrowUpRight01Icon,
	CheckmarkCircle02Icon,
	Copy01Icon,
	LinkSquare02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type ReactNode, useEffect, useState } from "react";

import type { ChainRecord } from "@/core/chains/application/ChainRecord";
import type { PortfolioViewActivity } from "@/core/chains/application/PortfolioView";
import { formatUnits } from "@/helpers/formatters";
import { cn } from "@/theme/utils.ts";
import { UiButtonVariants } from "@/ui/UiButton/base";
import { UiCopyButton } from "@/ui/UiCopyButton";
import { UiDrawer, UiDrawerContent, UiDrawerHeader, UiDrawerTitle } from "@/ui/UiDrawer";

import { liquidExplorerTxUrl } from "./liquidExplorerTxUrl";
import { LiquidTxStatusBadge } from "./LiquidTxStatus";

/** L-BTC (the network fee asset) is always 8 decimals; the fee is denominated in it, not the token. */
const L_BTC_DECIMALS = 8;

/**
 * A bottom-sheet detail view for one Liquid transaction, opened by tapping an activity row. Shows the
 * direction, signed amount, status, date, network fee, the full txid (copyable), and a link out to
 * the explorer. Controlled by `item`: non-null opens it; the last item is retained through the close
 * animation so the content doesn't blank out as it slides away.
 */
export function LiquidTxDetailSheet({
	chain,
	decimals,
	item,
	onClose,
	symbol,
}: {
	chain: ChainRecord;
	decimals: number;
	item: PortfolioViewActivity | null;
	onClose: () => void;
	symbol: string;
}) {
	const [shown, setShown] = useState<PortfolioViewActivity | null>(item);

	useEffect(() => {
		if (item) setShown(item);
	}, [item]);

	const active = item ?? shown;
	const isSent = active?.direction === "sent";
	const explorerUrl = active ? liquidExplorerTxUrl(chain, active.id) : null;

	return (
		<UiDrawer
			open={item !== null}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<UiDrawerContent className="max-h-[85vh]">
				<UiDrawerHeader className="pb-1 text-left">
					<UiDrawerTitle>Transaction</UiDrawerTitle>
				</UiDrawerHeader>

				{active ? (
					<div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-4 pb-6">
						<div className="flex flex-col items-center gap-2 py-2 text-center">
							<span className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
								<HugeiconsIcon icon={isSent ? ArrowUpRight01Icon : ArrowDownLeft01Icon} size={22} />
							</span>
							<p className="font-mono text-xl font-semibold tracking-tight">
								{isSent ? "−" : "+"}
								{formatUnits(active.amount, decimals)} {symbol}
							</p>
							<LiquidTxStatusBadge status={active.status} />
						</div>

						<dl className="divide-border/60 flex flex-col divide-y rounded-xl border">
							<DetailRow label="Direction">
								<span className="capitalize">{active.direction}</span>
							</DetailRow>
							<DetailRow label="Date">{active.date}</DetailRow>
							<DetailRow label="Network fee">
								{active.fee === null ? "—" : `${formatUnits(active.fee, L_BTC_DECIMALS)} L-BTC`}
							</DetailRow>
						</dl>

						<div className="flex flex-col gap-1.5">
							<span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
								Transaction ID
							</span>
							<UiCopyButton
								className="hover:bg-accent flex items-start gap-2 rounded-lg border px-3 py-2 text-left transition-colors"
								value={active.id}
							>
								{(copied) => (
									<>
										<span className="min-w-0 flex-1 font-mono text-xs break-all">{active.id}</span>
										<HugeiconsIcon
											className="text-muted-foreground mt-0.5 shrink-0"
											icon={copied ? CheckmarkCircle02Icon : Copy01Icon}
											size={16}
										/>
									</>
								)}
							</UiCopyButton>
						</div>

						{explorerUrl ? (
							<a
								className={cn(UiButtonVariants({ size: "lg", variant: "outline" }), "w-full")}
								href={explorerUrl}
								rel="noreferrer"
								target="_blank"
							>
								<HugeiconsIcon icon={LinkSquare02Icon} size={18} />
								View on explorer
							</a>
						) : null}
					</div>
				) : null}
			</UiDrawerContent>
		</UiDrawer>
	);
}

/** One label/value line in the detail list: a muted label left, the value right (mono where it fits). */
function DetailRow({ children, label }: { children: ReactNode; label: string }) {
	return (
		<div className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
			<dt className="text-muted-foreground shrink-0">{label}</dt>
			<dd className="min-w-0 truncate text-right font-medium">{children}</dd>
		</div>
	);
}
