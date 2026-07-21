import type {
	LiquidSendTransferParams,
	LiquidSendTransferResult,
} from "@humid/appkit-injected-adapter";
import { ArrowUpRightIcon, CheckCircle2Icon, Loader2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

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
import { formatLbtc, parseLbtc, truncateMiddle } from "@/lib/liquid";

import { ResultField, ReviewRow, TextAreaField, TextField } from "./fields";
import { useAsyncAction } from "./useAsyncAction";

type OverlayProps = { open: boolean; onOpenChange: (open: boolean) => void };

/** Build a wallet transfer: form → review → confirm, then a success (txid) or error state in-sheet. */
export function TransferSheet({ open, onOpenChange }: OverlayProps) {
	const { chainId, supportedChains, wallet } = useHumidContext();
	const network = supportedChains.find((chain) => chain.caipNetworkId === chainId);
	const ticker = network?.nativeCurrency.symbol ?? "L-BTC";

	const [step, setStep] = useState<"form" | "review">("form");
	const [recipient, setRecipient] = useState("");
	const [amount, setAmount] = useState("");
	const [assetId, setAssetId] = useState("");
	const [memo, setMemo] = useState("");
	const action = useAsyncAction<LiquidSendTransferResult>();

	const parsedAmount = parseLbtc(amount);
	const canReview = recipient.trim().length > 0 && parsedAmount !== null && parsedAmount > 0n;
	const pending = action.status === "pending";

	const resetForm = () => {
		setStep("form");
		setRecipient("");
		setAmount("");
		setAssetId("");
		setMemo("");
		action.reset();
	};

	const handleOpenChange = (next: boolean) => {
		onOpenChange(next);
		// Reset after the close animation so the form doesn't flash mid-exit.
		if (!next) window.setTimeout(resetForm, 250);
	};

	const confirm = async () => {
		if (parsedAmount === null) return;
		const params: LiquidSendTransferParams = {
			amount: parsedAmount.toString(),
			recipientAddress: recipient.trim(),
		};
		if (assetId.trim()) params.assetId = assetId.trim();
		if (memo.trim()) params.memo = memo.trim();

		const result = await action.run(() => wallet.sendTransfer(params));
		if (result.ok) {
			toast.success("Transfer sent", { description: truncateMiddle(result.data.txid, 10, 8) });
		} else {
			toast.error("Transfer failed", { description: result.error });
		}
	};

	return (
		<Sheet open={open} onOpenChange={handleOpenChange}>
			<SheetContent className="gap-0">
				<SheetHeader>
					<SheetTitle>Send {ticker}</SheetTitle>
					<SheetDescription>
						{step === "form"
							? "The wallet builds, confirms, and broadcasts the transfer."
							: "Review the details — the wallet will ask you to confirm."}
					</SheetDescription>
				</SheetHeader>

				<div className="flex-1 overflow-y-auto px-6 py-6">
					{action.status === "success" && action.data ? (
						<div className="flex flex-col gap-4">
							<div className="flex items-center gap-3">
								<CheckCircle2Icon className="size-5 text-emerald-500" />
								<div className="flex flex-col">
									<span className="text-sm font-medium">Transfer sent</span>
									<span className="text-muted-foreground text-xs">
										Broadcast to {network?.name ?? "the network"}.
									</span>
								</div>
							</div>
							<ResultField label="Transaction id" value={action.data.txid} />
						</div>
					) : step === "form" ? (
						<div className="flex flex-col gap-5">
							<TextField
								label="Recipient address"
								value={recipient}
								onChange={setRecipient}
								placeholder="Liquid address"
							/>
							<TextField
								label={`Amount (${ticker})`}
								mono={false}
								value={amount}
								onChange={setAmount}
								placeholder="0.00000000"
								hint={
									amount && parsedAmount === null
										? "Enter a valid amount (up to 8 decimals)."
										: undefined
								}
							/>
							<TextField
								label="Asset (optional)"
								value={assetId}
								onChange={setAssetId}
								placeholder={`Defaults to ${ticker}`}
							/>
							<TextAreaField
								label="Memo (optional, hex)"
								value={memo}
								onChange={setMemo}
								placeholder="Optional hex memo, ≤ 80 bytes"
							/>
						</div>
					) : (
						<div className="flex flex-col gap-4">
							<div className="divide-border border-border divide-y rounded-lg border px-4">
								<ReviewRow label="To" value={recipient.trim()} mono />
								<ReviewRow
									label="Amount"
									value={`${parsedAmount !== null ? formatLbtc(parsedAmount) : amount} ${ticker}`}
								/>
								<ReviewRow
									label="Asset"
									value={assetId.trim() || `${ticker} (native)`}
									mono={Boolean(assetId.trim())}
								/>
								{memo.trim() ? <ReviewRow label="Memo" value={memo.trim()} mono /> : null}
							</div>
							{action.status === "error" && action.error ? (
								<p className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border p-3 text-xs">
									{action.error}
								</p>
							) : null}
						</div>
					)}
				</div>

				<SheetFooter>
					{action.status === "success" ? (
						<Button onClick={() => handleOpenChange(false)}>Done</Button>
					) : step === "form" ? (
						<Button disabled={!canReview} onClick={() => setStep("review")}>
							Review transfer
						</Button>
					) : (
						<div className="flex gap-2">
							<Button
								variant="outline"
								className="flex-1"
								disabled={pending}
								onClick={() => setStep("form")}
							>
								Back
							</Button>
							<Button className="flex-1" disabled={pending} onClick={confirm}>
								{pending ? (
									<>
										<Loader2Icon className="animate-spin motion-reduce:animate-none" />
										Sending…
									</>
								) : (
									<>
										<ArrowUpRightIcon />
										Confirm &amp; send
									</>
								)}
							</Button>
						</div>
					)}
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}
