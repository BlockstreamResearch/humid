/** Portfolio headline: the native balance (mono) with its fiat value, or an empty state. */
export function BalanceSummary({
	native,
	totalFiat,
}: {
	native: { amount: string; symbol: string } | null;
	totalFiat: string | null;
}) {
	if (!native) {
		return (
			<div className="flex flex-col items-center gap-2 py-6">
				<div className="bg-muted text-muted-foreground flex size-14 items-center justify-center rounded-full text-xl">
					—
				</div>
				<p className="text-muted-foreground text-sm">No assets yet</p>
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
			</div>
		</div>
	);
}
