import { registerRPCService } from "@webext-pegasus/rpc";
import {
	definePegasusEventBus,
	definePegasusMessageBus,
	Endpoint,
} from "@webext-pegasus/transport";
import { initPegasusTransport } from "@webext-pegasus/transport/background";

import {
	ConfirmationDecision,
	ConfirmationRequest,
	EventProtocolListeners,
	ExtensionMessage,
	getSelfIDService,
	ISelfIDService,
	MsgProtocolRequestMethods,
	MsgProtocolResponseMethods,
} from "@/helpers/background";
import { sleep } from "@/helpers/promise";

export type PegasusMsgProtocolMap = {
	[MsgProtocolRequestMethods.Request]: ExtensionMessage;
	[MsgProtocolResponseMethods.RequestResponse]: ExtensionMessage<unknown>;
	[MsgProtocolRequestMethods.RequestConfirmation]: { id: number; data: ConfirmationRequest };
	[MsgProtocolResponseMethods.ConfirmResponse]: { id: number; data: ConfirmationDecision };
};

export type WalletProviderEventPayload = { chainId?: string };

export type PegasusEventProtocolMap = {
	[EventProtocolListeners.ExtensionEvent]: unknown;
	accountsChanged: WalletProviderEventPayload;
	bip122_walletDescriptorChanged: WalletProviderEventPayload;
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

export type BackgroundRpcHandlers = {
	injected: RequestHandlerMap;
	popup: RequestHandlerMap;
};

export function setupBackgroundTransport(): BackgroundTransport {
	initPegasusTransport();

	registerRPCService<ISelfIDService>("getSelfID", getSelfIDService);

	const eventBus = definePegasusEventBus<PegasusEventProtocolMap>();
	const messageBus = definePegasusMessageBus<PegasusMsgProtocolMap>();

	return { eventBus, messageBus };
}

export function registerBackgroundRpc(
	messageBus: BackgroundMessageBus,
	handlers: BackgroundRpcHandlers,
): void {
	messageBus.onMessage(MsgProtocolRequestMethods.Request, async (message) => {
		const sender = message.sender;
		const responseDestination =
			sender.context === "popup"
				? "popup"
				: sender.tabId === null
					? null
					: {
							context: "window" as const,
							tabId: sender.tabId,
						};

		if (!responseDestination) return;

		const sendResponse = (data: ExtensionMessage<unknown>) => {
			messageBus.sendMessage(MsgProtocolResponseMethods.RequestResponse, data, responseDestination);
		};

		const { method, id } = message.data;
		const handler = resolveRequestHandler(sender, method, handlers);

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

function serializeError(error: unknown): unknown {
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

function resolveRequestHandler(
	sender: Endpoint,
	method: string,
	handlers: BackgroundRpcHandlers,
): RequestHandler | undefined {
	if (sender.context === "popup") {
		return handlers.popup[method];
	}

	if (sender.context === "window") {
		return handlers.injected[method];
	}

	return undefined;
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
	const maybeAsyncIterable = value as Partial<AsyncIterable<unknown>> | null;

	return (
		typeof maybeAsyncIterable === "object" &&
		maybeAsyncIterable !== null &&
		typeof maybeAsyncIterable[Symbol.asyncIterator] === "function"
	);
}
