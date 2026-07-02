import { chainGroupUis } from "@/routes/App/chainGroupUis";
import { useHome } from "@/routes/App/pages/Home/HomeContext";
import { UiSpinner } from "@/ui/UiSpinner";

/**
 * Portfolio headline. The empty / syncing / error states are generic (sync-level); when there's a
 * balance, the selected chain group's `BalanceHeadline` renders it, so each chain owns how its
 * native balance looks.
 */
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
	const { chain } = useHome();
	const BalanceHeadline = chainGroupUis[chain.chainGroupId]?.BalanceHeadline;

	if (!native || !BalanceHeadline) {
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

	return <BalanceHeadline isSyncing={isSyncing} native={native} totalFiat={totalFiat} />;
}
