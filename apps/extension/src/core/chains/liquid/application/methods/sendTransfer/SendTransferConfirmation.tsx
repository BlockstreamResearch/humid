import type { ConfirmationRenderer } from "@/common/Confirmation";
import { SendReview, type SendReviewData } from "@/common/Confirmation/SendReview";
import { ShownAsset } from "@/common/Confirmation/ShownAsset";

import type { KnownAsset } from "../../confirmationFacts";

export const SEND_TRANSFER_CONFIRMATION_KIND = "liquid.sendTransfer";

export type SendTransferConfirmationData = {
	account: string;
	assetId: string;
	assets: Record<string, KnownAsset>;
	feeAssetId: string;
	kind: typeof SEND_TRANSFER_CONFIRMATION_KIND;
	network: string;
	review: SendReviewData;
};

export const sendTransferConfirmationRenderer: ConfirmationRenderer = {
	kind: SEND_TRANSFER_CONFIRMATION_KIND,
	render: ({ busy, onConfirm, onDecline, request }) => {
		if (!isSendTransferConfirmationData(request.data)) return null;

		const data = request.data;
		const shown = (id: string) =>
			new ShownAsset(id, data.assets[id]?.ticker, data.assets[id]?.decimals);

		return (
			<SendReview
				origin={request.requester?.origin}
				network={data.network}
				signer={`Signing with ${data.account}`}
				rejectLabel="Reject"
				asset={shown(data.assetId)}
				feeAsset={shown(data.feeAssetId)}
				review={data.review}
				isSending={busy}
				onReject={onDecline}
				onConfirm={(quote) => onConfirm({ targetBlocks: quote.targetBlocks })}
			/>
		);
	},
};

function isSendTransferConfirmationData(data: unknown): data is SendTransferConfirmationData {
	if (typeof data !== "object" || data === null) return false;

	const candidate = data as Partial<SendTransferConfirmationData>;

	return (
		candidate.kind === SEND_TRANSFER_CONFIRMATION_KIND &&
		typeof candidate.account === "string" &&
		typeof candidate.assetId === "string" &&
		typeof candidate.feeAssetId === "string" &&
		typeof candidate.network === "string" &&
		typeof candidate.assets === "object" &&
		Array.isArray(candidate.review?.quotes) &&
		candidate.review.quotes.length > 0 &&
		typeof candidate.review.recipientAddress === "string"
	);
}
