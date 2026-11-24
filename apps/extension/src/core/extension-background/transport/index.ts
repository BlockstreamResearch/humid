import { LIQUID_WALLET_DESCRIPTOR_CHANGED_EVENT } from "@humid/wallet-rpc";
import {
	definePegasusEventBus,
	definePegasusMessageBus,
	Endpoint,
} from "@webext-pegasus/transport";
import { initPegasusTransport } from "@webext-pegasus/transport/background";

import {
	ConfirmationDecision,
	ConfirmationOutcome,
	ConfirmationRequest,
	EventProtocolListeners,
	ExtensionMessage,
	MsgProtocolRequestMethods,
	MsgProtocolResponseMethods,
} from "@/helpers/background";
import { sleep } from "@/helpers/promise";

export type PegasusMsgProtocolMap = {
	[MsgProtocolRequestMethods.Request]: ExtensionMessage;
	[MsgProtocolResponseMethods.RequestResponse]: ExtensionMessage<unknown>;
	[MsgProtocolRequestMethods.RequestConfirmation]: { id: string; data: ConfirmationRequest };
	[MsgProtocolResponseMethods.ConfirmResponse]: { id: string; data: ConfirmationDecision };
	[MsgProtocolRequestMethods.ShowOutcome]: { id: string; data: ConfirmationOutcome };
};

export type WalletProviderEventPayload = { chainId?: string };

export type PegasusEventProtocolMap = {
	[EventProtocolListeners.ExtensionEvent]: unknown;
	accountsChanged: WalletProviderEventPayload;
	[LIQUID_WALLET_DESCRIPTOR_CHANGED_EVENT]: WalletProviderEventPayload;
	chainChanged: WalletProviderEventPayload;
	connect: WalletProviderEventPayload;
	disconnect: WalletProviderEventPayload;
	wallet_sessionChanged: WalletProviderEventPayload;
};

export type BackgroundMessageBus = ReturnType<
	typeof definePegasusMessageBus<PegasusMsgProtocolMap>
>;

export type BackgroundEventBus = ReturnType<typeof definePegasusEventBus<PegasusEventProtocolMap>>;

export type BackgroundTransport = {
	eventBus: BackgroundEventBus;
	messageBus: BackgroundMessageBus;
};

export type RequestHandler = (
	message: ExtensionMessage,
	sender: Endpoint,
) => Promise<unknown> | unknown | AsyncIterable<unknown>;

export type RequestHandlerMap = Record<string, RequestHandler>;

export function setupBackgroundTransport(): BackgroundTransport {
	initPegasusTransport();

	const eventBus = definePegasusEventBus<PegasusEventProtocolMap>();
	const messageBus = definePegasusMessageBus<PegasusMsgProtocolMap>();

	return { eventBus, messageBus };
}

/** Serves the wallet's own pages. Dapps reach the wallet through the page port instead. */
export function registerPopupRpc(
	messageBus: BackgroundMessageBus,
	handlers: RequestHandlerMap,
): void {
	messageBus.onMessage(MsgProtocolRequestMethods.Request, async (message) => {
		const sender = message.sender;

		if (sender.context !== "popup") return;

		const sendResponse = (data: ExtensionMessage<unknown>) => {
			messageBus.sendMessage(MsgProtocolResponseMethods.RequestResponse, data, "popup");
		};

		const { method, id } = message.data;
		const handler = handlers[method];

		if (!handler) {
			sendResponse({
				method,
				id,
				error: `No handler for method: ${method}`,
			});

			return;
		}

		try {
			const result = handler(message.data, sender);

			if (isAsyncIterable(result)) {
				try {
					for await (const chunk of result) {
						sendResponse({
							id,
							type: "stream",
							method,
							data: { type: "chunk", data: chunk },
						});

						await sleep(0);
					}

					sendResponse({
						id,
						type: "stream",
						method,
						data: { type: "end" },
					});
				} catch (error) {
					sendResponse({
						id,
						type: "stream",
						method,
						data: {
							type: "error",
							error: serializeError(error),
						},
					});
				}

				return;
			}

			sendResponse({
				method,
				id,
				data: await result,
			});
		} catch (error) {
			sendResponse({
				method,
				id,
				error: serializeError(error),
			});
		}
	});
}

export function serializeError(error: unknown): unknown {
	if (error instanceof Error) {
		const structured = error as Error & { code?: unknown; data?: unknown };

		return {
			message: error.message,
			...(typeof structured.code === "number" ? { code: structured.code } : {}),
			...(structured.data === undefined ? {} : { data: structured.data }),
		};
	}

	return error;
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
	const maybeAsyncIterable = value as Partial<AsyncIterable<unknown>> | null;

	return (
		typeof maybeAsyncIterable === "object" &&
		maybeAsyncIterable !== null &&
		typeof maybeAsyncIterable[Symbol.asyncIterator] === "function"
	);
}
