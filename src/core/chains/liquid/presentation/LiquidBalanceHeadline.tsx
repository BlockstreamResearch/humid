import { UiSpinner } from "@/ui/UiSpinner";

/** Liquid balance headline: the native L-BTC glyph, the amount, its fiat total, and a sync hint. */
export function LiquidBalanceHeadline({
	isSyncing,
	native,
	totalFiat,
}: {
	isSyncing: boolean;
	native: { amount: string; symbol: string };
	totalFiat: string | null;
}) {
	return (
		<div className="flex flex-col items-center gap-3 py-2">
			<div className="bg-muted flex size-14 items-center justify-center rounded-full text-lg font-semibold">
				{native.symbol.charAt(0)}
			</div>
			<div className="flex flex-col items-center gap-0.5">
				<p className="font-mono text-2xl font-semibold tracking-tight">
					{native.amount} {native.symbol}
				</p>
				{totalFiat ? <p className="text-muted-foreground text-sm">{totalFiat}</p> : null}
				{isSyncing ? (
					<p className="text-muted-foreground flex items-center gap-1.5 text-xs">
						<UiSpinner className="size-3" /> Syncing…
					</p>
				) : null}
			</div>
		</div>
	);
}
