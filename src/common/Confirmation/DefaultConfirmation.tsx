import type { ConfirmationRequest } from "@/helpers/background";
import { UiButton } from "@/ui/UiButton/base";

type Props = {
	onConfirm: (result?: unknown) => void;
	onDecline: () => void;
	request: ConfirmationRequest;
};

/** Default confirmation body: a title, an optional message, and accept/reject buttons. */
export function DefaultConfirmation({ onConfirm, onDecline, request }: Props) {
	return (
		<div className="bg-background text-foreground flex size-full flex-col items-center gap-2 p-4 text-center">
			{request.title && <h2 className="cn-font-heading mb-4 text-xl font-bold">{request.title}</h2>}
			{request.message && (
				<p className="text-muted-foreground mb-6 text-sm leading-6">{request.message}</p>
			)}
			<div className="mt-auto flex items-center gap-4">
				<UiButton type="button" variant="outline" onClick={onDecline}>
					Decline
				</UiButton>
				<UiButton type="button" onClick={() => onConfirm()}>
					Confirm
				</UiButton>
			</div>
		</div>
	);
}
