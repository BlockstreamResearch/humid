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
};

export function createConfirmationResponder(
	messageBus: BackgroundMessageBus,
): ConfirmationResponder {
	const confirm = async <TResult = unknown>(
		request: ConfirmationRequest,
	): Promise<ConfirmationDecision<TResult>> => {
		const id = Math.floor(Math.random() * 1_000_000);
		const windowId = await openNotification();

		await sleep(NOTIFICATION_SETTLE_MS);

		messageBus.sendMessage(
			MsgProtocolRequestMethods.RequestConfirmation,
			{ id, data: request },
			"popup",
		);

		return new Promise((resolve) => {
			const timeout = setTimeout(() => {
				resolve({ approved: false });
				void closeNotification(windowId);
			}, CONFIRMATION_TIMEOUT_MS);

			const removeResponseListener = messageBus.onMessage(
				MsgProtocolResponseMethods.ConfirmResponse,
				({ data: response }) => {
					if (response.id !== id) return;

					clearTimeout(timeout);
					removeResponseListener();
					resolve((response.data ?? { approved: false }) as ConfirmationDecision<TResult>);
					void closeNotification(windowId);
				},
			);
		});
	};

	return { confirm };
}
