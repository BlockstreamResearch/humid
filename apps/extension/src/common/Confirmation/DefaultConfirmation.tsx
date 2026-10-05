import type { ConfirmationRequest } from "@/helpers/background";
import { UiButton } from "@/ui/UiButton/base";

type Props = {
	onConfirm: (result?: unknown) => void;
	onDecline: () => void;
	request: ConfirmationRequest;
};

function ConfirmationRequestDetails({ request }: { request: ConfirmationRequest }) {
	return (
		<p className="text-muted-foreground text-left text-xs break-all whitespace-pre-wrap">
			{`Requesting app / origin: ${request.requester?.name ? `${request.requester.name}\n` : ""}${request.requester?.origin ?? "Requester information unavailable"}\nMethod: ${request.method ?? "Unavailable"}`}
		</p>
	);
}

export function DefaultConfirmation({ onConfirm, onDecline, request }: Props) {
	return (
		<div className="bg-background text-foreground flex size-full flex-col gap-4 p-4">
			{request.title && <h2 className="cn-font-heading mb-4 text-xl font-bold">{request.title}</h2>}
			<div className="flex-1 space-y-4 overflow-y-auto">
				{(request.method || request.requester) && <ConfirmationRequestDetails request={request} />}
				{request.message && (
					<p className="text-sm leading-6 break-words whitespace-pre-wrap">{request.message}</p>
				)}
			</div>
			<div className="mt-auto flex items-center justify-center gap-4">
				<UiButton type="button" variant="outline" onClick={onDecline}>
					Decline
				</UiButton>
				<UiButton type="button" onClick={() => onConfirm()}>
					{request.confirmLabel ?? "Confirm"}
				</UiButton>
			</div>
		</div>
	);
}
