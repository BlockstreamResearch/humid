import { registerRPCService } from "@webext-pegasus/rpc";
import {
	definePegasusEventBus,
	definePegasusMessageBus,
	Endpoint,
} from "@webext-pegasus/transport";
import { initPegasusTransport } from "@webext-pegasus/transport/background";

import {
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
	[MsgProtocolRequestMethods.RequestConfirmation]: ExtensionMessage<ConfirmationRequest>;
	[MsgProtocolResponseMethods.ConfirmResponse]: {
		id: number;
		data: boolean;
	};
};

export type PegasusEventProtocolMap = {
	[EventProtocolListeners.ExtensionEvent]: unknown;
};

export type BackgroundMessageBus = ReturnType<
	typeof definePegasusMessageBus<PegasusMsgProtocolMap>
>;

export type RequestHandler = (
	message: ExtensionMessage,
	sender: Endpoint,
) => Promise<unknown> | unknown | AsyncIterable<unknown>;

export type RequestHandlerMap = Record<string, RequestHandler>;

export type BackgroundRpcHandlers = {
	injected: RequestHandlerMap;
	popup: RequestHandlerMap;
};

/**
 * Wires the background transport: pegasus init, the self-id RPC service, and the
 * event/message buses. Returns the message bus the rest of the background uses.
 */
export function setupBackgroundTransport(): BackgroundMessageBus {
	initPegasusTransport();

	registerRPCService<ISelfIDService>("getSelfID", getSelfIDService);

	definePegasusEventBus<PegasusEventProtocolMap>();

	return definePegasusMessageBus<PegasusMsgProtocolMap>();
}

/**
 * Registers the single request listener that dispatches by sender context. The
 * injected (dapp) and popup (internal) registries are kept separate so a dapp can
 * never reach an internal method by name.
 */
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
							error: error instanceof Error ? error.message : error,
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
				error: error instanceof Error ? error.message : error,
			});
		}
	});
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
