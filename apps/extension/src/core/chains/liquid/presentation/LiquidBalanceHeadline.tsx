import { formatUnits } from "@/helpers/formatters";

export function LiquidBalanceHeadline({
	native,
}: {
	native: { amount: bigint; decimals: number; symbol: string };
}) {
	return (
		<div className="flex flex-col items-center gap-3 py-2">
			<div className="bg-muted flex size-14 items-center justify-center rounded-full text-lg font-semibold">
				{native.symbol.charAt(0)}
			</div>
			<p className="font-mono text-2xl font-semibold tracking-tight">
				{formatUnits(native.amount, native.decimals)} {native.symbol}
			</p>
		</div>
	);
}
