import type { LiquidGetUTXOsResult } from "@humid/appkit-injected-adapter";
import { CoinsIcon, Loader2Icon, RefreshCwIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { useHumidContext } from "@/contexts/Web3Provider/HumidProvider";
import { formatLbtc, truncateMiddle } from "@/lib/liquid";

import { TextField } from "./fields";
import { useAsyncAction } from "./useAsyncAction";

type OverlayProps = { open: boolean; onOpenChange: (open: boolean) => void };
type Utxo = LiquidGetUTXOsResult["utxos"][number];

/** Read the wallet's coins (UTXOs) for the policy asset or a supplied asset id; loads on open. */
export function ViewCoinsSheet({ open, onOpenChange }: OverlayProps) {
	const { chainId, supportedChains, wallet } = useHumidContext();
	const network = supportedChains.find((chain) => chain.caipNetworkId === chainId);
	const ticker = network?.nativeCurrency.symbol ?? "L-BTC";

	const [assetId, setAssetId] = useState("");
	const action = useAsyncAction<LiquidGetUTXOsResult>();
	const pending = action.status === "pending";

	const load = async () => {
		const filter = assetId.trim();
		const result = await action.run(() =>
			wallet.getUTXOs(filter ? { assetId: filter } : undefined),
		);
		if (!result.ok) toast.error("Couldn't load coins", { description: result.error });
	};

	const handleOpenChange = (next: boolean) => {
		onOpenChange(next);
		// Reset after the close animation so the list doesn't flash mid-exit.
		if (!next) {
			window.setTimeout(() => {
				setAssetId("");
				action.reset();
			}, 250);
		}
	};

	// Fetch once when the sheet opens; a manual reload is available in the footer.
	useEffect(() => {
		if (open && action.status === "idle") void load();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open]);

	const result = action.status === "success" ? action.data : undefined;
	const utxos = result?.utxos ?? [];

	const renderAmount = (utxo: Utxo) => {
		if (result && utxo.assetId === result.policyAssetId) {
			return `${formatLbtc(BigInt(utxo.amount))} ${ticker}`;
		}
		return utxo.amount;
	};

	return (
		<Sheet open={open} onOpenChange={handleOpenChange}>
			<SheetContent className="gap-0">
				<SheetHeader>
					<SheetTitle>Your coins</SheetTitle>
					<SheetDescription>
						The wallet&apos;s spendable and pending UTXOs for the selected asset.
					</SheetDescription>
				</SheetHeader>

				<div className="flex flex-1 flex-col gap-5 overflow-y-auto px-6 py-6">
					<TextField
						label="Asset (optional)"
						value={assetId}
						disabled={pending}
						placeholder={`Defaults to ${ticker}`}
						onChange={setAssetId}
						hint="Leave blank for the native asset."
					/>

					{action.status === "error" && action.error ? (
						<p className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border p-3 text-xs">
							{action.error}
						</p>
					) : pending ? (
						<div className="text-muted-foreground flex items-center justify-center gap-2 py-10 text-sm">
							<Loader2Icon className="size-4 animate-spin motion-reduce:animate-none" />
							Loading coins…
						</div>
					) : utxos.length === 0 && action.status === "success" ? (
						<div className="text-muted-foreground flex flex-col items-center gap-2 py-10 text-center text-sm">
							<CoinsIcon className="size-6 opacity-60" />
							No coins in this wallet yet.
						</div>
					) : (
						<div className="divide-border border-border divide-y rounded-lg border">
							{utxos.map((utxo) => (
								<div key={`${utxo.txid}:${utxo.vout}`} className="flex flex-col gap-2 px-4 py-3">
									<div className="flex items-center justify-between gap-3">
										<span className="text-sm font-medium">{renderAmount(utxo)}</span>
										<Badge variant={utxo.spendable ? "secondary" : "outline"}>
											{utxo.spendable ? "Spendable" : "Pending"}
										</Badge>
									</div>
									<div className="text-muted-foreground flex flex-col gap-0.5 font-mono text-xs break-all">
										<span>Asset {truncateMiddle(utxo.assetId, 10, 8)}</span>
										<span>
											{truncateMiddle(utxo.txid, 10, 8)}:{utxo.vout}
										</span>
									</div>
								</div>
							))}
						</div>
					)}
				</div>

				<SheetFooter>
					<Button variant="outline" disabled={pending} onClick={() => void load()}>
						{pending ? (
							<>
								<Loader2Icon className="animate-spin motion-reduce:animate-none" />
								Loading…
							</>
						) : (
							<>
								<RefreshCwIcon />
								Reload
							</>
						)}
					</Button>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}
