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
	confirm: <TResult = unknown>(
		request: ConfirmationRequest,
	) => Promise<ConfirmationDecision<TResult>>;
	cancelActive: () => void;
};

export function createConfirmationResponder(
	messageBus: BackgroundMessageBus,
): ConfirmationResponder {
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

			const entry = { cancel: () => settle({ approved: false }, false) };
			active = entry;
		});
	};

	return {
		cancelActive: () => active?.cancel(),
		confirm,
	};
}
