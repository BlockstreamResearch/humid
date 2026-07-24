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
	// Symmetric request/response: the pegasus key already identifies the message, so the
	// payload carries only the correlation id + the confirmation body (no redundant method).
	[MsgProtocolRequestMethods.RequestConfirmation]: { id: number; data: ConfirmationRequest };
	[MsgProtocolResponseMethods.ConfirmResponse]: { id: number; data: ConfirmationDecision };
};

/**
 * Payload for the wallet provider events broadcast to injected dapps (window.humid.on). This is a
 * GLOBAL broadcast bus — it reaches every window.humid on every tab — so an event carries only
 * non-sensitive context (a chainId at most); a dapp re-queries the origin-scoped RPC to read its own
 * authorized view. The point-to-point WalletConnect transport carries the full scoped payload.
 */
export type WalletProviderEventPayload = { chainId?: string };

export type PegasusEventProtocolMap = {
	[EventProtocolListeners.ExtensionEvent]: unknown;
	// Hybrid event scheme: EIP-1193 core (MetaMask parity + what reown AppKit's adapter listens for)
	// + CAIP-25 wallet_sessionChanged + the ELIP-1 chain-scoped `bip122_walletDescriptorChanged`
	// (name kept in sync with LIQUID_WALLET_DESCRIPTOR_CHANGED_EVENT).
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

/**
 * Wires the background transport: pegasus init, the self-id RPC service, and the event/message
 * buses. Returns both — the message bus for RPC, the event bus for broadcasting wallet provider
 * events to injected dapps (window.humid.on). The event bus was previously discarded, so nothing
 * could emit; capturing it here is what makes the wallet-event broadcaster possible.
 */
export function setupBackgroundTransport(): BackgroundTransport {
	initPegasusTransport();

	registerRPCService<ISelfIDService>("getSelfID", getSelfIDService);

	const eventBus = definePegasusEventBus<PegasusEventProtocolMap>();
	const messageBus = definePegasusMessageBus<PegasusMsgProtocolMap>();

	return { eventBus, messageBus };
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

/**
 * Preserve a structured RPC error across the message boundary. A thrown `WalletRpcError` carries a
 * numeric `code` and a `data.reason` the dapp branches on (e.g. skip retrying a user rejection);
 * collapsing it to `error.message` — as this used to — dropped both, leaving the dapp a bare string
 * it could not classify. Kept structural (no wallet-rpc import) so any error with code/data survives.
 */
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
