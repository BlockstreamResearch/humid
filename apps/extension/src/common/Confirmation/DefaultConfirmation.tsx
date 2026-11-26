import { useState } from "react";

import type { ConfirmationRequest } from "@/helpers/background";
import { UiField, UiFieldLabel } from "@/ui/UiField";
import { UiInput } from "@/ui/UiInput/base";

import { ConfirmationActions, ConfirmationLayout } from "./ConfirmationLayout";

type Props = {
	busy?: boolean;
	onConfirm: (result?: unknown) => void;
	onDecline: () => void;
	request: ConfirmationRequest;
};

export function DefaultConfirmation({ busy, onConfirm, onDecline, request }: Props) {
	const [typed, setTyped] = useState("");
	const { confirmPhrase } = request;

	return (
		<ConfirmationLayout
			origin={request.requester?.origin}
			title={request.title}
			footer={
				<ConfirmationActions
					busy={busy}
					canConfirm={confirmPhrase === undefined || typed.trim() === confirmPhrase}
					confirmLabel={request.confirmLabel ?? "Confirm"}
					rejectLabel={request.rejectLabel}
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
			{confirmPhrase !== undefined && (
				<UiField>
					<UiFieldLabel htmlFor="confirm-phrase">
						Type <span className="font-mono font-semibold">{confirmPhrase}</span> to confirm.
					</UiFieldLabel>
					<UiInput
						autoComplete="off"
						className="h-11"
						id="confirm-phrase"
						spellCheck={false}
						value={typed}
						onChange={(event) => setTyped(event.target.value)}
					/>
				</UiField>
			)}
		</ConfirmationLayout>
	);
}
