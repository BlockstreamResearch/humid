import { useState } from "react";

import { ConfirmationActions, ConfirmationLayout } from "@/common/Confirmation/ConfirmationLayout";
import {
	AmountRow,
	ConfirmationNote,
	ConfirmationSection,
	TextBlock,
} from "@/common/Confirmation/ConfirmationParts";
import { type FeeSpeed, FeeSpeedPicker } from "@/common/Confirmation/FeeSpeedPicker";
import { ShownAsset } from "@/common/Confirmation/ShownAsset";
import type {
	TransferQuote,
	TransferReview,
} from "@/core/accounts/application/accounts-rpc/model/types";

import type { SendableAsset } from "../model";

const EDGE = 8;

const SPEEDS: (FeeSpeed & { targetBlocks: number })[] = [
	{ id: "slow", name: "Slow", targetBlocks: 60, time: "~1 hour" },
	{ id: "normal", name: "Normal", targetBlocks: 10, time: "~10 min" },
	{ id: "fast", name: "Fast", targetBlocks: 1, time: "~1 min" },
];

type SendReviewProps = {
	account: string;
	asset: SendableAsset;
	error: string | null;
	feeAsset: SendableAsset;
	isSending: boolean;
	network: string;
	onBack: () => void;
	onConfirm: (quote: TransferQuote) => void;
	review: TransferReview;
};

export function SendReview({
	account,
	asset,
	error,
	feeAsset,
	isSending,
	network,
	onBack,
	onConfirm,
	review,
}: SendReviewProps) {
	const [speed, setSpeed] = useState("fast");
	const quote = quoteFor(review, speed);
	const shown = shownAsset(asset);
	const amount = BigInt(quote.amount);
	const fee = BigInt(quote.feeSats);

	return (
		<ConfirmationLayout
			account={account}
			network={network}
			title={`Send ${shown.amountWithLabel(amount)}`}
			statement={
				review.recipientConfidential ? "To a confidential address." : "To an explicit address."
			}
			footer={
				<ConfirmationActions
					rejectLabel="Back"
					confirmLabel={isSending ? "Sending…" : "Send"}
					busy={isSending}
					onReject={onBack}
					onConfirm={() => onConfirm(quote)}
				/>
			}
		>
			<ConfirmationSection title="Balance changes">
				{asset.isNative ? (
					<AmountRow asset={shown} units={-(amount + fee)} note="Payment and fee" />
				) : (
					<>
						<AmountRow asset={shown} units={-amount} note="Payment" />
						<AmountRow asset={shownAsset(feeAsset)} units={-fee} note="Network fee" />
					</>
				)}
			</ConfirmationSection>
			<TextBlock title="To">
				<span className="font-mono text-[13px] break-all">
					<strong className="font-bold">{review.recipientAddress.slice(0, EDGE)}</strong>
					<span className="text-foreground/70">{review.recipientAddress.slice(EDGE, -EDGE)}</span>
					<strong className="font-bold">{review.recipientAddress.slice(-EDGE)}</strong>
				</span>
			</TextBlock>
			{!review.recipientConfidential && (
				<ConfirmationNote tone="warning">
					This address is explicit. Anyone can see the amount and asset of this transfer on the
					Liquid network.
				</ConfirmationNote>
			)}
			<FeeSpeedPicker
				speeds={SPEEDS}
				value={speed}
				fee={`${quote.feeSats} sats`}
				onChange={setSpeed}
			/>
			{error !== null && <p className="text-destructive text-sm break-words">{error}</p>}
		</ConfirmationLayout>
	);
}

function quoteFor(review: TransferReview, speed: string): TransferQuote {
	const targetBlocks = SPEEDS.find((candidate) => candidate.id === speed)?.targetBlocks;

	return (
		review.quotes.find((candidate) => candidate.targetBlocks === targetBlocks) ??
		review.quotes.at(-1)!
	);
}

function shownAsset(asset: SendableAsset): ShownAsset {
	return new ShownAsset(asset.rawAssetId, asset.symbol, asset.decimals);
}
