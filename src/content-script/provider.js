import { getRPCService } from "@webext-pegasus/rpc";
import { definePegasusEventBus, definePegasusMessageBus } from "@webext-pegasus/transport";
import { initPegasusTransport } from "@webext-pegasus/transport/window";

const init = async () => {
	initPegasusTransport({
		namespace: "humid",
	});

	const eventBus = definePegasusEventBus();
	const messageBus = definePegasusMessageBus();

	await getRPCService("getSelfID", "background")();

	let requestId = 0;

	// ONE shared response dispatcher + a pending-by-id map. `messageBus.onMessage` keeps a SINGLE
	// handler per message key (its store is a Map keyed by message id, not a list), so registering a
	// fresh listener inside every request() would let each new request clobber the previous request's
	// response listener — overlapping requests (e.g. a connect held open for the approval popup while
	// the dashboard polls getSession) then silently lose their responses. Mirrors the popup client in
	// core/extension-rpc.
	const pending = new Map();

	messageBus.onMessage("request_response", (message) => {
		const response = message.data;
		const entry = pending.get(response.id);

		if (!entry) return;

		if (response.error) {
			if (entry.streamController) {
				entry.streamController.error(response.error);
			} else {
				entry.reject(response.error);
			}

			pending.delete(response.id);
			return;
		}

		if (response.type === "stream") {
			if (!entry.streamController) {
				// eslint-disable-next-line no-undef
				const stream = new ReadableStream({
					start(controller) {
						entry.streamController = controller;
						handleStreamMessage(response.data, controller, () => pending.delete(response.id));
					},
				});

				entry.resolve(stream);
				return;
			}

			handleStreamMessage(response.data, entry.streamController, () => pending.delete(response.id));
			return;
		}

		entry.resolve(response.data);
		pending.delete(response.id);
	});

	const provider = {
		request: (args) => {
			const id = args?.id ?? ++requestId;

			return new Promise((resolve, reject) => {
				pending.set(id, { resolve, reject, streamController: null });
				messageBus.sendMessage("request", { ...args, id }, "background");
			});
		},
		on: (args) => {
			if (!args.event) throw new Error("Missing event");

			if (!args.listener) throw new Error("Missing listener");

			return eventBus.onBroadcastEvent(args.event, args.listener);
		},
	};

	// eslint-disable-next-line no-undef
	window.humid = provider;
};

const handleStreamMessage = (streamMessage, controller, removeRequestListener) => {
	if (streamMessage.type === "chunk") {
		controller.enqueue(streamMessage.data);
		return;
	}

	if (streamMessage.type === "end") {
		controller.close();
		removeRequestListener();
		return;
	}

	if (streamMessage.type === "error") {
		controller.error(new Error(streamMessage.error));
		removeRequestListener();
	}
};

void init();
