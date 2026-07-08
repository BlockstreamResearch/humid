import { Alert02Icon, ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { UiAlert, UiAlertDescription, UiAlertTitle } from "@/ui/UiAlert";
import { UiButton } from "@/ui/UiButton/base";
import { UiScrollArea } from "@/ui/UiScrollArea";

type SendReviewProps = {
	amountLabel: string;
	error: string | null;
	isSending: boolean;
	onBack: () => void;
	onConfirm: () => void;
	recipientAddress: string;
	recipientConfidential: boolean;
	symbol: string;
};

function DetailRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-center justify-between gap-3">
			<span className="text-muted-foreground">{label}</span>
			<span className="font-medium">{value}</span>
		</div>
	);
}

/**
 * Step 2 of the Send flow: the preview returned by `accounts.inspectTransfer`. Shows amount, asset,
 * and recipient, and — per ELIP-1 — a clear warning when the recipient address is unconfidential, so
 * the user knows the transfer's amount and asset will be publicly visible before confirming.
 */
export function SendReview({
	amountLabel,
	error,
	isSending,
	onBack,
	onConfirm,
	recipientAddress,
	recipientConfidential,
	symbol,
}: SendReviewProps) {
	return (
		<div className="flex size-full min-h-0 flex-col">
			<header className="border-border/60 flex shrink-0 items-center gap-2 border-b px-2 py-2.5">
				<button
					aria-label="Back"
					className="text-muted-foreground hover:bg-accent hover:text-foreground rounded-md p-1.5 transition-colors disabled:opacity-50"
					disabled={isSending}
					onClick={onBack}
					type="button"
				>
					<HugeiconsIcon icon={ArrowLeft01Icon} size={18} />
				</button>
				<p className="text-sm font-semibold">Review send</p>
			</header>

			<UiScrollArea className="min-h-0 flex-1">
				<div className="flex flex-col gap-4 px-5 py-5">
					<div className="flex flex-col items-center gap-1 py-2 text-center">
						<p className="text-2xl font-semibold">
							{amountLabel} {symbol}
						</p>
						<p className="text-muted-foreground text-sm">You&apos;re sending</p>
					</div>

					<div className="flex flex-col gap-3 rounded-xl border p-4 text-sm">
						<DetailRow label="Asset" value={symbol} />
						<DetailRow label="Amount" value={`${amountLabel} ${symbol}`} />
						<div className="flex flex-col gap-1">
							<span className="text-muted-foreground">Recipient</span>
							<span className="font-mono text-xs break-all">{recipientAddress}</span>
						</div>
					</div>

					{recipientConfidential ? null : (
						<UiAlert variant="destructive">
							<HugeiconsIcon icon={Alert02Icon} size={16} />
							<UiAlertTitle>Unconfidential address</UiAlertTitle>
							<UiAlertDescription>
								This recipient address is unconfidential, so confidentiality will be lost — the
								amount and asset of this transfer will be publicly visible on the Liquid network.
							</UiAlertDescription>
						</UiAlert>
					)}

					{error ? <p className="text-destructive text-sm break-words">{error}</p> : null}

					<div className="flex gap-2">
						<UiButton
							className="flex-1"
							disabled={isSending}
							onClick={onBack}
							size="lg"
							type="button"
							variant="outline"
						>
							Back
						</UiButton>
						<UiButton
							className="flex-1"
							disabled={isSending}
							onClick={onConfirm}
							size="lg"
							type="button"
						>
							{isSending ? "Sending…" : "Confirm & send"}
						</UiButton>
					</div>
				</div>
			</UiScrollArea>
		</div>
	);
}
