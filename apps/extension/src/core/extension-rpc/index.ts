import { definePegasusMessageBus } from "@webext-pegasus/transport";
import { z } from "zod";

import type { PegasusMsgProtocolMap } from "@/background";
import { MsgProtocolRequestMethods, MsgProtocolResponseMethods } from "@/helpers/background";

const REQUEST_TIMEOUT_MS = 60_000;
const backgroundErrorSchema = z.union([
	z.string().min(1),
	z.object({ message: z.string().min(1) }),
]);

let requestId = 0;

type PendingRequest = {
	resolve: (value: unknown) => void;
	reject: (reason?: unknown) => void;
	timeoutId: ReturnType<typeof setTimeout>;
};

const pendingRequests = new Map<number, PendingRequest>();

type BackgroundMessageBus = ReturnType<typeof definePegasusMessageBus<PegasusMsgProtocolMap>>;

let messageBus: BackgroundMessageBus | null = null;

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
			const parsed = backgroundErrorSchema.safeParse(response.error);
			const errorMessage = parsed.success
				? typeof parsed.data === "string"
					? parsed.data
					: parsed.data.message
				: "The wallet request failed. Try again.";
			pendingRequest.reject(new Error(errorMessage));
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
