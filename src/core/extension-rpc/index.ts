import { definePegasusMessageBus } from "@webext-pegasus/transport";

import type { PegasusMsgProtocolMap } from "@/background";
import { MsgProtocolRequestMethods, MsgProtocolResponseMethods } from "@/helpers/background";

const messageBus = definePegasusMessageBus<PegasusMsgProtocolMap>();
const REQUEST_TIMEOUT_MS = 60_000;

let requestId = 0;

type PendingRequest = {
	resolve: (value: unknown) => void;
	reject: (reason?: unknown) => void;
	timeoutId: ReturnType<typeof setTimeout>;
};

const pendingRequests = new Map<number, PendingRequest>();

messageBus.onMessage(MsgProtocolResponseMethods.RequestResponse, (message) => {
	const response = message.data;

	if (response.id === undefined) return;

	const pendingRequest = pendingRequests.get(response.id);

	if (!pendingRequest) return;

	pendingRequests.delete(response.id);
	clearTimeout(pendingRequest.timeoutId);

	if (response.error) {
		pendingRequest.reject(new Error(String(response.error)));
		return;
	}

	pendingRequest.resolve(response.data);
});

export function requestBackground<TResponse>(method: string, data?: unknown): Promise<TResponse> {
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

		void messageBus
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
