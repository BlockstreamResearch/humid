import type { ConfirmationRequest } from "@/helpers/background";

import { ConfirmationActions, ConfirmationLayout } from "./ConfirmationLayout";

type Props = {
	onConfirm: (result?: unknown) => void;
	onDecline: () => void;
	request: ConfirmationRequest;
};

export function DefaultConfirmation({ onConfirm, onDecline, request }: Props) {
	return (
		<ConfirmationLayout
			origin={request.requester?.origin}
			title={request.title}
			footer={
				<ConfirmationActions
					confirmLabel={request.confirmLabel ?? "Confirm"}
					onReject={onDecline}
					onConfirm={() => onConfirm()}
				/>
			}
		>
			{request.message && (
				<p className="bg-muted rounded-lg px-3 py-2.5 text-sm leading-5 break-words whitespace-pre-wrap">
					{request.message}
				</p>
			)}
		</ConfirmationLayout>
	);
}
