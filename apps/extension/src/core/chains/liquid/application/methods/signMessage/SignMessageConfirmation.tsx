import type { ConfirmationRenderer } from "@/common/Confirmation";
import { ConfirmationDetails } from "@/common/Confirmation/ConfirmationDetails";
import { ConfirmationActions, ConfirmationLayout } from "@/common/Confirmation/ConfirmationLayout";
import { FactRow, TextBlock } from "@/common/Confirmation/ConfirmationParts";

export const SIGN_MESSAGE_CONFIRMATION_KIND = "liquid.signMessage";

export type SignMessageConfirmationData = {
	address: string;
	kind: typeof SIGN_MESSAGE_CONFIRMATION_KIND;
	message: string;
	network: string;
	protocol: string;
};

export function SignMessageConfirmation({
	data,
	origin,
	onConfirm,
	onReject,
}: {
	data: SignMessageConfirmationData;
	origin?: string;
	onConfirm: () => void;
	onReject: () => void;
}) {
	return (
		<ConfirmationLayout
			origin={origin}
			network={data.network}
			title="Sign a message"
			statement="Proves control of an address in this account. Signing moves no funds."
			footer={<ConfirmationActions confirmLabel="Sign" onReject={onReject} onConfirm={onConfirm} />}
		>
			<TextBlock title="Message" byDapp>
				{data.message}
			</TextBlock>
			<ConfirmationDetails summary="Signing address">
				<div>
					<FactRow label="Signing address" value={data.address} mono />
					<FactRow label="Signature" value={data.protocol.toUpperCase()} />
				</div>
			</ConfirmationDetails>
		</ConfirmationLayout>
	);
}

export const signMessageConfirmationRenderer: ConfirmationRenderer = {
	kind: SIGN_MESSAGE_CONFIRMATION_KIND,
	render: ({ onConfirm, onDecline, request }) =>
		isSignMessageConfirmationData(request.data) ? (
			<SignMessageConfirmation
				data={request.data}
				origin={request.requester?.origin}
				onConfirm={() => onConfirm()}
				onReject={onDecline}
			/>
		) : null,
};

function isSignMessageConfirmationData(data: unknown): data is SignMessageConfirmationData {
	return (
		typeof data === "object" &&
		data !== null &&
		(data as { kind?: unknown }).kind === SIGN_MESSAGE_CONFIRMATION_KIND
	);
}
