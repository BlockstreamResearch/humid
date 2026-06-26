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

	const provider = {
		request: (args) => {
			const id = args?.id ?? ++requestId;
			messageBus.sendMessage("request", { ...args, id }, "background");

			return new Promise((resolve, reject) => {
				let streamInitialized = false;
				let streamController = null;

				const removeRequestListener = messageBus.onMessage("request_response", (message) => {
					const extensionMessage = message.data;

					if (extensionMessage.id !== id) return;

					if (message.data.error) {
						if (streamInitialized && streamController) {
							streamController.error(message.data.error);
						} else {
							reject(message.data.error);
						}
						removeRequestListener();
						return;
					}

					if (extensionMessage.type === "stream") {
						if (!streamInitialized) {
							streamInitialized = true;

							// eslint-disable-next-line no-undef
							const stream = new ReadableStream({
								start(controller) {
									streamController = controller;
									handleStreamMessage(extensionMessage.data, controller, removeRequestListener);
								},
							});

							resolve(stream);
							return;
						}

						handleStreamMessage(extensionMessage.data, streamController, removeRequestListener);
						return;
					}

					resolve(extensionMessage.data);
					removeRequestListener();
				});
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
