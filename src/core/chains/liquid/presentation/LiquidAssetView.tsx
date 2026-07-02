import { ArrowDownLeft01Icon, ArrowUpRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode } from "react";

import type {
	PortfolioViewActivity,
	PortfolioViewAsset,
} from "@/core/chains/application/PortfolioView";

/** Liquid asset detail body: the balance headline, the account actions, and the tx history. */
export function LiquidAssetView({
	actions,
	activity,
	token,
}: {
	actions: ReactNode;
	activity: PortfolioViewActivity[];
	token: PortfolioViewAsset;
}) {
	return (
		<>
			<div className="flex flex-col items-center gap-0.5 py-2">
				<p className="font-mono text-2xl font-semibold tracking-tight">
					{token.amount} {token.symbol}
				</p>
				<p className="text-muted-foreground text-sm">{token.fiat}</p>
			</div>
			{actions}
			<LiquidActivityList items={activity} symbol={token.symbol} />
		</>
	);
}

/** Liquid transaction history: direction, amount (mono), date, and the (confidential) txid. */
function LiquidActivityList({ items, symbol }: { items: PortfolioViewActivity[]; symbol: string }) {
	return (
		<div className="flex flex-col gap-1">
			<p className="text-muted-foreground px-1 text-xs font-medium tracking-wide uppercase">
				Activity
			</p>
			{items.length === 0 ? (
				<p className="text-muted-foreground px-1 py-6 text-center text-sm">No activity yet.</p>
			) : (
				<div className="flex flex-col">
					{items.map((item) => {
						const isSent = item.direction === "sent";

						return (
							<div key={item.id} className="flex items-center gap-3 px-1 py-2.5">
								<div className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-full">
									<HugeiconsIcon
										icon={isSent ? ArrowUpRight01Icon : ArrowDownLeft01Icon}
										size={16}
									/>
								</div>
								<div className="min-w-0 flex-1">
									<p className="text-sm font-medium capitalize">{item.direction}</p>
									<p className="text-muted-foreground truncate text-xs">
										{item.date} · {isSent ? "To" : "From"}: {item.counterparty}
									</p>
								</div>
								<div className="text-right">
									<p className="font-mono text-sm">
										{isSent ? "−" : "+"}
										{item.amount} {symbol}
									</p>
									<p className="text-muted-foreground text-xs">{item.fiat}</p>
								</div>
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}
