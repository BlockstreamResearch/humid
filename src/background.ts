import { registerRPCService } from "@webext-pegasus/rpc";
import {
	definePegasusEventBus,
	definePegasusMessageBus,
	Endpoint,
} from "@webext-pegasus/transport";
import { initPegasusTransport } from "@webext-pegasus/transport/background";

import * as vault from "@/core/vault/background";
import type { VaultCreateInput, VaultStatus, VaultUnlockInput } from "@/core/vault/types";
import {
	closePopup,
	ConfirmationRequest,
	EventProtocolListeners,
	ExtensionMessage,
	getSelfIDService,
	initPopupManagement,
	ISelfIDService,
	MsgProtocolRequestMethods,
	MsgProtocolResponseMethods,
	openPopup,
	updateBadgeOnStorageChange,
} from "@/helpers/background";
import { sleep } from "@/helpers/promise";
import { authStore } from "@/store/auth";

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

const isAsyncIterable = (value: unknown): value is AsyncIterable<unknown> => {
	const maybeAsyncIterable = value as Partial<AsyncIterable<unknown>> | null;

	return (
		typeof maybeAsyncIterable === "object" &&
		maybeAsyncIterable !== null &&
		typeof maybeAsyncIterable[Symbol.asyncIterator] === "function"
	);
};

const requirePopupSender = (sender: Endpoint) => {
	if (sender.context !== "popup") {
		throw new Error("This method is only available from the extension popup");
	}
};

const syncAuthStore = (status: VaultStatus) => {
	authStore.useAuthStore.getState().setVaultStatus({
		hasVault: status.hasVault,
		isUnlocked: status.isUnlocked,
	});

	return status;
};

const init = async () => {
	initPegasusTransport();

	registerRPCService<ISelfIDService>("getSelfID", getSelfIDService);

	definePegasusEventBus<PegasusEventProtocolMap>();
	const messageBus = definePegasusMessageBus<PegasusMsgProtocolMap>();

	await authStore.backendReady();

	syncAuthStore(await vault.initializeVaultStorage());

	const waitForConfirmationResponse = async <T>(
		title: string,
		message: string | undefined,
		data: T,
		id = Math.floor(Math.random() * 1_000_000),
	): Promise<boolean> => {
		const windowId = await openPopup();

		await sleep(200);

		messageBus.sendMessage(
			MsgProtocolRequestMethods.RequestConfirmation,
			{
				method: MsgProtocolRequestMethods.RequestConfirmation,
				id,
				data: {
					title,
					message,
					data,
				},
			},
			"popup",
		);

		return new Promise((resolve) => {
			const timeout = setTimeout(() => {
				resolve(false);
				void closePopup(windowId);
			}, 30_000);

			const removeResponseListener = messageBus.onMessage(
				MsgProtocolResponseMethods.ConfirmResponse,
				({ data: response }) => {
					if (response.id !== id) return;

					clearTimeout(timeout);
					removeResponseListener();
					resolve(Boolean(response.data));
					void closePopup(windowId);
				},
			);
		});
	};

	const registerMessageListener = (
		handlers: Record<
			string,
			(
				message: ExtensionMessage,
				sender: Endpoint,
			) => Promise<unknown> | unknown | AsyncIterable<unknown>
		>,
	) => {
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
				messageBus.sendMessage(
					MsgProtocolResponseMethods.RequestResponse,
					data,
					responseDestination,
				);
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
				if (sender.tabId) {
					sendResponse({
						method,
						id,
						error: error instanceof Error ? error.message : error,
					});
				}
			}
		});
	};

	registerMessageListener({
		ping: (message) => {
			return {
				message: "pong",
				request: message.data ?? null,
			};
		},
		confirm: async (message) => {
			const data = message.data as Partial<ConfirmationRequest> | undefined;

			return waitForConfirmationResponse(
				data?.title ?? "Confirm action?",
				data?.message,
				data?.data,
			);
		},
		"vault.create": async (message, sender) => {
			requirePopupSender(sender);

			const status = await vault.createVault(message.data as VaultCreateInput);

			return syncAuthStore(status);
		},
		"vault.unlock": async (message, sender) => {
			requirePopupSender(sender);

			const status = await vault.unlockVault(message.data as VaultUnlockInput);

			return syncAuthStore(status);
		},
		"vault.lock": async (_message, sender) => {
			requirePopupSender(sender);

			const status = await vault.lockVault();

			return syncAuthStore(status);
		},
		"vault.reset": async (_message, sender) => {
			requirePopupSender(sender);

			const confirmed = await waitForConfirmationResponse(
				"Reset local vault?",
				"This will remove the encrypted vault from this browser profile.",
				null,
			);

			if (!confirmed) return vault.getVaultStatus();

			const status = await vault.resetVault();

			return syncAuthStore(status);
		},
	});

	updateBadgeOnStorageChange();
	initPopupManagement();
};

void init();
