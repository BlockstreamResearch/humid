import type { ConfirmationDecision, ConfirmationRequest } from "@/helpers/background";
import {
	closeNotification,
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
	let active: { cancel: (reason: "closed" | "superseded") => void } | null = null;

	const confirm = <TResult = unknown>(
		request: ConfirmationRequest,
	): Promise<ConfirmationDecision<TResult>> => {
		active?.cancel("superseded");

		const { promise, resolve, reject } = Promise.withResolvers<ConfirmationDecision<TResult>>();
		const id = Math.floor(Math.random() * 1_000_000);
		let settled = false;
		let windowId: number | undefined;
		let timeout: ReturnType<typeof setTimeout> | undefined;
		let removeResponseListener: (() => void) | undefined;

		const cleanup = () => {
			clearTimeout(timeout);
			removeResponseListener?.();
			if (active === entry) active = null;
		};

		const settle = (decision: ConfirmationDecision<TResult>, closeWindow: boolean) => {
			if (settled) return;
			settled = true;
			cleanup();
			if (closeWindow && windowId !== undefined) void closeNotification(windowId);
			resolve(decision);
		};

		const entry = {
			cancel: (reason: "closed" | "superseded") => settle({ approved: false, reason }, false),
		};
		active = entry;

		const sendRequest = async () => {
			windowId = await openNotification();
			if (settled) return;
			await sleep(NOTIFICATION_SETTLE_MS);
			if (settled) return;

			timeout = setTimeout(
				() => settle({ approved: false, reason: "timeout" }, true),
				CONFIRMATION_TIMEOUT_MS,
			);
			removeResponseListener = messageBus.onMessage(
				MsgProtocolResponseMethods.ConfirmResponse,
				({ data: response }) => {
					if (response.id !== id) return;
					settle((response.data ?? { approved: false }) as ConfirmationDecision<TResult>, true);
				},
			);
			await messageBus.sendMessage(
				MsgProtocolRequestMethods.RequestConfirmation,
				{ id, data: request },
				"popup",
			);
		};

		void sendRequest().catch((error: unknown) => {
			if (settled) return;
			settled = true;
			cleanup();
			if (windowId !== undefined) void closeNotification(windowId);
			reject(error);
		});
		return promise;
	};

	return {
		cancelActive: () => active?.cancel("closed"),
		confirm,
	};
}
