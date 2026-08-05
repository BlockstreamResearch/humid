import { definePegasusMessageBus } from "@webext-pegasus/transport";

import type { PegasusMsgProtocolMap } from "@/background";
import { MsgProtocolRequestMethods, MsgProtocolResponseMethods } from "@/helpers/background";

import { toError } from "./toError";

const REQUEST_TIMEOUT_MS = 60_000;

let requestId = 0;

type PendingRequest = {
	resolve: (value: unknown) => void;
	reject: (reason?: unknown) => void;
	timeoutId: ReturnType<typeof setTimeout>;
};

const pendingRequests = new Map<number, PendingRequest>();

type BackgroundMessageBus = ReturnType<typeof definePegasusMessageBus<PegasusMsgProtocolMap>>;

let messageBus: BackgroundMessageBus | null = null;

/**
 * Lazily bind the pegasus message bus + response listener on first use. Binding at module-eval
 * time would require `initPegasusTransport()` to have already run in the current context, but ES
 * imports evaluate before an entry's body (where transport is initialized) — so importing this
 * module must stay side-effect-free. By the first `requestBackground` call (an effect or user
 * action) the entry has initialized transport.
 */
function getMessageBus(): BackgroundMessageBus {
	if (messageBus) return messageBus;

	const bus = definePegasusMessageBus<PegasusMsgProtocolMap>();

	bus.onMessage(MsgProtocolResponseMethods.RequestResponse, (message) => {
		const response = message.data;

		if (response.id === undefined) return;

		const pendingRequest = pendingRequests.get(response.id);

		if (!pendingRequest) return;

		pendingRequests.delete(response.id);
		clearTimeout(pendingRequest.timeoutId);

		if (response.error) {
			pendingRequest.reject(toError(response.error));
			return;
		}

		pendingRequest.resolve(response.data);
	});

	messageBus = bus;

	return bus;
}

export function requestBackground<TResponse>(method: string, data?: unknown): Promise<TResponse> {
	const bus = getMessageBus();
	const id = ++requestId;

	return new Promise((resolve, reject) => {
		const timeoutId = setTimeout(() => {
			pendingRequests.delete(id);
			reject(new Error("The extension did not respond. Try again."));
		}, REQUEST_TIMEOUT_MS);

		pendingRequests.set(id, {
			resolve: (value) => resolve(value as TResponse),
			reject,
			timeoutId,
		});

		void bus
			.sendMessage(
				MsgProtocolRequestMethods.Request,
				{
					method,
					id,
					data,
				},
				"background",
			)
			.catch((error) => {
				pendingRequests.delete(id);
				clearTimeout(timeoutId);
				reject(error);
			});
	});
}
