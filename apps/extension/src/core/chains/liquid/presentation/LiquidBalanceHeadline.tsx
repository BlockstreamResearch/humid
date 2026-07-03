import { formatUnits } from "@/helpers/formatters";
import { UiSpinner } from "@/ui/UiSpinner";

/** Liquid balance headline: the native L-BTC glyph, the amount, and a sync hint. */
export function LiquidBalanceHeadline({
	isSyncing,
	native,
}: {
	isSyncing: boolean;
	native: { amount: bigint; decimals: number; symbol: string };
}) {
	return (
		<div className="flex flex-col items-center gap-3 py-2">
			<div className="bg-muted flex size-14 items-center justify-center rounded-full text-lg font-semibold">
				{native.symbol.charAt(0)}
			</div>
			<div className="flex flex-col items-center gap-0.5">
				<p className="font-mono text-2xl font-semibold tracking-tight">
					{formatUnits(native.amount, native.decimals)} {native.symbol}
				</p>
				{isSyncing ? (
					<p className="text-muted-foreground flex items-center gap-1.5 text-xs">
						<UiSpinner className="size-3" /> Syncing…
					</p>
				) : null}
			</div>
		</div>
	);
}
