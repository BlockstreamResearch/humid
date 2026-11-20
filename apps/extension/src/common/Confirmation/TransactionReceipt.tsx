import {
	Copy01Icon,
	LinkSquare02Icon,
	SquareArrowUpRightIcon,
	Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { cn } from "@/theme/utils.ts";
import { UiButton } from "@/ui/UiButton/base";
import { UiCopyButton } from "@/ui/UiCopyButton";

import { ConfirmationLayout, hostOf } from "./ConfirmationLayout";
import { AmountRow, ConfirmationSection } from "./ConfirmationParts";
import { ShownAsset } from "./ShownAsset";

export type TransactionReceiptData = {
	assets: Record<string, { decimals: number; ticker: string }>;
	changes: { amount: string; asset: string }[];
	explorerUrl?: string;
	fee: string;
	network: string;
	txid?: string;
};

export function transferChanges({
	amount,
	asset,
	feeAsset,
	feeSats,
}: {
	amount: string;
	asset: string;
	feeAsset: string;
	feeSats: string;
}): TransactionReceiptData["changes"] {
	const spent = (sats: bigint) => (-sats).toString();

	return asset === feeAsset
		? [{ amount: spent(BigInt(amount) + BigInt(feeSats)), asset }]
		: [
				{ amount: spent(BigInt(amount)), asset },
				{ amount: spent(BigInt(feeSats)), asset: feeAsset },
			];
}

export function TransactionReceipt({
	receipt,
	origin,
	onDone,
}: {
	receipt: TransactionReceiptData;
	origin?: string;
	onDone: () => void;
}) {
	const sent = receipt.txid !== undefined;
	const holder = origin === undefined ? "The dapp" : hostOf(origin);

	return (
		<div className="bg-background text-foreground flex size-full flex-col">
			<main className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 pt-6 pb-4">
				<div className="flex flex-col items-center gap-3 text-center">
					<div className="flex flex-col gap-1">
						<h1 className="flex items-center justify-center gap-2 text-xl leading-7 font-bold">
							<span
								aria-hidden="true"
								className={cn(
									"flex size-8 items-center justify-center rounded-full",
									sent ? "bg-info text-info-accent" : "bg-muted text-foreground",
								)}
							>
								<HugeiconsIcon
									icon={sent ? Tick02Icon : SquareArrowUpRightIcon}
									className="size-4"
								/>
							</span>
							{sent ? "Transaction sent" : "Signed and returned"}
						</h1>
						<p className="text-foreground/80 text-sm leading-5">
							{sent
								? `Sent to ${receipt.network}. Waiting for the confirmation.`
								: `${holder} now holds the signature and decides when the transaction goes out.`}
						</p>
					</div>
				</div>
				<ConfirmationSection title={sent ? "Balance changes" : "If the dapp sends the transaction"}>
					{receipt.changes.map((change) => {
						const known = receipt.assets[change.asset];

						return (
							<AmountRow
								key={change.asset}
								asset={new ShownAsset(change.asset, known?.ticker, known?.decimals)}
								units={BigInt(change.amount)}
							/>
						);
					})}
					<div className="border-border/60 flex items-center justify-between border-t py-2.5 text-sm">
						<span className="text-muted-foreground">Network fee</span>
						<span className="font-mono tabular-nums">{receipt.fee}</span>
					</div>
				</ConfirmationSection>
				{receipt.txid === undefined ? (
					<p className="text-muted-foreground text-[13px] leading-[18px]">
						The transaction shows up in the account activity once the dapp sends the transaction.
					</p>
				) : (
					<section className="flex flex-col gap-1.5">
						<header className="flex items-center justify-between gap-2">
							<h2 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
								Transaction ID
							</h2>
							{receipt.explorerUrl !== undefined && (
								<a
									className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs font-medium"
									href={receipt.explorerUrl}
									rel="noreferrer"
									target="_blank"
								>
									View on explorer
									<HugeiconsIcon icon={LinkSquare02Icon} className="size-3.5" />
								</a>
							)}
						</header>
						<UiCopyButton
							className="border-border hover:bg-accent flex items-start gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors"
							value={receipt.txid}
						>
							{(copied) => (
								<>
									<span className="min-w-0 flex-1 font-mono text-xs leading-[18px] break-all">
										{receipt.txid}
									</span>
									<HugeiconsIcon
										icon={copied ? Tick02Icon : Copy01Icon}
										className="text-muted-foreground mt-px size-4 shrink-0"
									/>
								</>
							)}
						</UiCopyButton>
					</section>
				)}
			</main>
			<footer className="border-border flex flex-col border-t px-4 pt-3 pb-4">
				<UiButton type="button" className="h-11" onClick={onDone}>
					Done
				</UiButton>
			</footer>
		</div>
	);
}

export function ConfirmationFailure({
	message,
	origin,
	onClose,
}: {
	message: string;
	origin?: string;
	onClose: () => void;
}) {
	return (
		<ConfirmationLayout
			origin={origin}
			title="The request failed"
			statement={message}
			footer={
				<UiButton type="button" variant="outline" className="h-11" onClick={onClose}>
					Close
				</UiButton>
			}
		/>
	);
}
