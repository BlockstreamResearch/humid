import {
	closeNotification,
	ConfirmationDecision,
	ConfirmationRequest,
	MsgProtocolRequestMethods,
	MsgProtocolResponseMethods,
	openNotification,
} from "@/helpers/background";
import { sleep } from "@/helpers/promise";

import type { BackgroundMessageBus } from "../transport";

const CONFIRMATION_TIMEOUT_MS = 30_000;
const NOTIFICATION_SETTLE_MS = 200;

export type ConfirmationResponder = {
	/**
	 * Open a confirmation window, show the request, and await the popup's decision.
	 * Always resolves a {@link ConfirmationDecision}; the result shape is whatever the
	 * request's renderer produces (`TResult`), so callers that only need approval read
	 * `.approved` and callers that collect data (e.g. connect) read `.result`.
	 */
	confirm: <TResult = unknown>(
		request: ConfirmationRequest,
	) => Promise<ConfirmationDecision<TResult>>;
	/**
	 * Resolve the confirmation currently awaiting a decision as declined. Wired to the notification
	 * window's unexpected close (the user dismissed it): otherwise the pending confirm() — and the
	 * dapp request behind it (e.g. wallet_createSession) — would block until the 30s timeout.
	 */
	cancelActive: () => void;
};

export function createConfirmationResponder(
	messageBus: BackgroundMessageBus,
): ConfirmationResponder {
	// At most ONE confirmation is live at a time. The notification window is a singleton and a dapp
	// only cares about its latest prompt, so a new confirm() supersedes the pending one (resolving it
	// declined). This stops abandoned prompts from lingering to the timeout, stops their late responses
	// from cross-matching a newer prompt's id, and stops duplicate windows from stacking up.
	let active: { cancel: () => void } | null = null;

	const confirm = async <TResult = unknown>(
		request: ConfirmationRequest,
	): Promise<ConfirmationDecision<TResult>> => {
		active?.cancel();

		const id = Math.floor(Math.random() * 1_000_000);
		const windowId = await openNotification();

		await sleep(NOTIFICATION_SETTLE_MS);

		messageBus.sendMessage(
			MsgProtocolRequestMethods.RequestConfirmation,
			{ id, data: request },
			"popup",
		);

		return new Promise((resolve) => {
			let settled = false;

			const settle = (decision: ConfirmationDecision<TResult>, closeWindow: boolean) => {
				if (settled) return;
				settled = true;

				clearTimeout(timeout);
				removeResponseListener();
				if (active === entry) active = null;
				if (closeWindow) void closeNotification(windowId);

				resolve(decision);
			};

			const timeout = setTimeout(() => settle({ approved: false }, true), CONFIRMATION_TIMEOUT_MS);

			const removeResponseListener = messageBus.onMessage(
				MsgProtocolResponseMethods.ConfirmResponse,
				({ data: response }) => {
					if (response.id !== id) return;

					settle((response.data ?? { approved: false }) as ConfirmationDecision<TResult>, true);
				},
			);

			// Superseded by a newer confirm(), or the user closed the window: resolve declined but do
			// NOT close the window — the superseding prompt reuses it, and a user-closed window is gone.
			const entry = { cancel: () => settle({ approved: false }, false) };
			active = entry;
		});
	};

	return {
		cancelActive: () => active?.cancel(),
		confirm,
	};
}
