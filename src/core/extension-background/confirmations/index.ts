import {
	closeNotification,
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
	/** Confirmation handler shape consumed by chain-group and WalletConnect adapters. */
	confirm: (request: ConfirmationRequest) => Promise<boolean>;
	/** Low-level form: open a confirmation window and await the popup decision. */
	waitForConfirmationResponse: (
		title: string,
		message: string | undefined,
		data: unknown,
		id?: number,
	) => Promise<boolean>;
};

export function createConfirmationResponder(
	messageBus: BackgroundMessageBus,
): ConfirmationResponder {
	const waitForConfirmationResponse = async (
		title: string,
		message: string | undefined,
		data: unknown,
		id = Math.floor(Math.random() * 1_000_000),
	): Promise<boolean> => {
		const windowId = await openNotification();

		await sleep(NOTIFICATION_SETTLE_MS);

		messageBus.sendMessage(
			MsgProtocolRequestMethods.RequestConfirmation,
			{
				method: MsgProtocolRequestMethods.RequestConfirmation,
				id,
				data: {
					title,
					message,
					data,
				},
			},
			"popup",
		);

		return new Promise((resolve) => {
			const timeout = setTimeout(() => {
				resolve(false);
				void closeNotification(windowId);
			}, CONFIRMATION_TIMEOUT_MS);

			const removeResponseListener = messageBus.onMessage(
				MsgProtocolResponseMethods.ConfirmResponse,
				({ data: response }) => {
					if (response.id !== id) return;

					clearTimeout(timeout);
					removeResponseListener();
					resolve(Boolean(response.data));
					void closeNotification(windowId);
				},
			);
		});
	};

	return {
		confirm: (request) => waitForConfirmationResponse(request.title, request.message, request.data),
		waitForConfirmationResponse,
	};
}
