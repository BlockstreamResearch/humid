import { useState } from "react";

import type { TransferQuote } from "@/core/accounts/application/accounts-rpc/model/types";

import { ConfirmationActions, ConfirmationLayout } from "./ConfirmationLayout";
import { AmountRow, ConfirmationNote, ConfirmationSection, TextBlock } from "./ConfirmationParts";
import { DEFAULT_TARGET_BLOCKS, FeeSpeedPicker } from "./FeeSpeedPicker";
import type { ShownAsset } from "./ShownAsset";

const EDGE = 8;

export type SendReviewData = {
	quotes: TransferQuote[];
	recipientAddress: string;
	recipientConfidential: boolean;
};

type SendReviewProps = {
	origin?: string;
	account?: string;
	network: string;
	signer?: string;
	rejectLabel: string;
	asset: ShownAsset;
	feeAsset: ShownAsset;
	review: SendReviewData;
	error?: string | null;
	isSending?: boolean;
	onReject: () => void;
	onConfirm: (quote: TransferQuote) => void;
};

export function SendReview({
	origin,
	account,
	network,
	signer,
	rejectLabel,
	asset,
	feeAsset,
	review,
	error = null,
	isSending = false,
	onReject,
	onConfirm,
}: SendReviewProps) {
	const [targetBlocks, setTargetBlocks] = useState(DEFAULT_TARGET_BLOCKS);
	const quote =
		review.quotes.find((candidate) => candidate.targetBlocks === targetBlocks) ??
		review.quotes.at(-1)!;
	const amount = BigInt(quote.amount);
	const fee = BigInt(quote.feeSats);

	return (
		<ConfirmationLayout
			origin={origin}
			account={account}
			network={network}
			title={`Send ${asset.amountWithLabel(amount)}`}
			statement={
				review.recipientConfidential ? "To a confidential address." : "To an explicit address."
			}
			footer={
				<ConfirmationActions
					signer={signer}
					rejectLabel={rejectLabel}
					confirmLabel={isSending ? "Sending…" : "Send"}
					busy={isSending}
					onReject={onReject}
					onConfirm={() => onConfirm(quote)}
				/>
			}
		>
			<ConfirmationSection title="Balance changes">
				{asset.id === feeAsset.id ? (
					<AmountRow asset={asset} units={-(amount + fee)} note="Payment and fee" />
				) : (
					<>
						<AmountRow asset={asset} units={-amount} note="Payment" />
						<AmountRow asset={feeAsset} units={-fee} note="Network fee" />
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
				value={targetBlocks}
				fee={`${quote.feeSats} sats`}
				onChange={setTargetBlocks}
			/>
			{error !== null && <p className="text-destructive text-sm break-words">{error}</p>}
		</ConfirmationLayout>
	);
}
