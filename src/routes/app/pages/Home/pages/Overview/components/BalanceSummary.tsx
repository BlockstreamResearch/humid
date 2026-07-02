import { UiSpinner } from "@/ui/UiSpinner";

/** Portfolio headline: the native balance (mono) with its fiat value, plus a sync hint. */
export function BalanceSummary({
	error,
	isSyncing,
	native,
	totalFiat,
}: {
	error: string | null;
	isSyncing: boolean;
	native: { amount: string; symbol: string } | null;
	totalFiat: string | null;
}) {
	if (!native) {
		return (
			<div className="flex flex-col items-center gap-2 py-6">
				<div className="bg-muted text-muted-foreground flex size-14 items-center justify-center rounded-full text-xl">
					—
				</div>
				{isSyncing ? (
					<p className="text-muted-foreground flex items-center gap-1.5 text-sm">
						<UiSpinner className="size-3.5" /> Syncing…
					</p>
				) : error ? (
					<p className="text-destructive text-sm">Couldn't sync — retrying…</p>
				) : (
					<p className="text-muted-foreground text-sm">No assets yet</p>
				)}
			</div>
		);
	}

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
