import { registerRPCService } from "@webext-pegasus/rpc";
import {
	definePegasusEventBus,
	definePegasusMessageBus,
	Endpoint,
} from "@webext-pegasus/transport";
import { initPegasusTransport } from "@webext-pegasus/transport/background";

import { resolveUnlockedLiquidChain } from "@/core/chains/liquid/chains/resolveLiquidChain";
import { createLiquidChainGroup } from "@/core/chains/liquid/createLiquidChainGroup";
import { parseLiquidChainId } from "@/core/chains/liquid/domain/validation";
import { walletVaultBackground } from "@/core/secure-vault/application/wallet-vault/background";
import { walletVaultRpc } from "@/core/secure-vault/application/wallet-vault/model/rpc";
import * as walletConnect from "@/core/walletconnect/background";
import type {
	WalletConnectDisconnectInput,
	WalletConnectPairInput,
} from "@/core/walletconnect/types";
import {
	closeNotification,
	ConfirmationRequest,
	EventProtocolListeners,
	ExtensionMessage,
	getSelfIDService,
	initNotificationManagement,
	ISelfIDService,
	MsgProtocolRequestMethods,
	MsgProtocolResponseMethods,
	openNotification,
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

type InjectedWalletRpcMessage = ExtensionMessage & {
	chainId?: string;
	params?: unknown;
};

type RequestHandler = (
	message: ExtensionMessage,
	sender: Endpoint,
) => Promise<unknown> | unknown | AsyncIterable<unknown>;

type RequestHandlerMap = Record<string, RequestHandler>;

const isAsyncIterable = (value: unknown): value is AsyncIterable<unknown> => {
	const maybeAsyncIterable = value as Partial<AsyncIterable<unknown>> | null;

	return (
		typeof maybeAsyncIterable === "object" &&
		maybeAsyncIterable !== null &&
		typeof maybeAsyncIterable[Symbol.asyncIterator] === "function"
	);
};

const syncAuthStore = (status: Awaited<ReturnType<typeof walletVaultBackground.getStatus>>) => {
	authStore.useAuthStore.getState().setVaultStatus({
		hasVault: status.hasVault,
		isUnlocked: status.isUnlocked,
	});

	return status;
};

const resolveRequestHandler = (
	sender: Endpoint,
	method: string,
	handlers: {
		injected: RequestHandlerMap;
		popup: RequestHandlerMap;
	},
): RequestHandler | undefined => {
	if (sender.context === "popup") {
		return handlers.popup[method];
	}

	if (sender.context === "window") {
		return handlers.injected[method];
	}

	return undefined;
};

const init = async () => {
	initPegasusTransport();

	registerRPCService<ISelfIDService>("getSelfID", getSelfIDService);

	definePegasusEventBus<PegasusEventProtocolMap>();
	const messageBus = definePegasusMessageBus<PegasusMsgProtocolMap>();

	await authStore.backendReady();

	syncAuthStore(await walletVaultBackground.initializeStorage());

	const waitForConfirmationResponse = async <T>(
		title: string,
		message: string | undefined,
		data: T,
		id = Math.floor(Math.random() * 1_000_000),
	): Promise<boolean> => {
		const windowId = await openNotification();

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
				void closeNotification(windowId);
			}, 30_000);

			const removeResponseListener = messageBus.onMessage(
				MsgProtocolResponseMethods.ConfirmResponse,
				({ data: response }) => {
					if (response.id !== id) return;

					clearTimeout(timeout);
					removeResponseListener();
					resolve(Boolean(response.data));
					void closeNotification(windowId);
				},
			);
		});
	};

	const liquidChainGroup = createLiquidChainGroup();
	const createInjectedWalletRpcHandlers = () =>
		Object.fromEntries(
			liquidChainGroup.walletRpcDispatcher.methods.map((method) => [
				method,
				async (message: ExtensionMessage) => {
					const request = message as InjectedWalletRpcMessage;
					const chainId = parseLiquidChainId(request.chainId ?? "");
					const chain = await resolveUnlockedLiquidChain(chainId);

					return liquidChainGroup.walletRpcDispatcher.dispatch(
						{
							method,
							params: request.params ?? request.data,
						},
						{
							chain,
							confirm: (confirmation) =>
								waitForConfirmationResponse(
									confirmation.title,
									confirmation.message,
									confirmation.data,
								),
							keyManagerState: walletVaultBackground.keyManager.getState(),
							updateKeyManagerState: walletVaultBackground.keyManager.updateState,
						},
					);
				},
			]),
		);

	walletConnect.registerWalletConnectNamespaceAdapter(liquidChainGroup.walletConnectAdapter);

	await walletConnect.initializeWalletConnectBackground({
		confirm: ({ data, message, title }) => waitForConfirmationResponse(title, message, data),
	});

	const registerMessageListener = (handlers: {
		injected: RequestHandlerMap;
		popup: RequestHandlerMap;
	}) => {
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
	};

	registerMessageListener({
		injected: createInjectedWalletRpcHandlers(),
		popup: {
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
			[walletVaultRpc.methods.create]: async (message) => {
				const status = await walletVaultBackground.create(
					message.data as Parameters<typeof walletVaultBackground.create>[0],
				);

				return syncAuthStore(status);
			},
			[walletVaultRpc.methods.unlock]: async (message) => {
				const status = await walletVaultBackground.unlock(
					message.data as Parameters<typeof walletVaultBackground.unlock>[0],
				);

				return syncAuthStore(status);
			},
			[walletVaultRpc.methods.lock]: async () => {
				const status = await walletVaultBackground.lock();

				return syncAuthStore(status);
			},
			[walletVaultRpc.methods.reset]: async () => {
				const status = await walletVaultBackground.reset();

				return syncAuthStore(status);
			},
			"walletconnect.status": () => {
				return walletConnect.getWalletConnectStatus();
			},
			"walletconnect.pair": async (message) => {
				return walletConnect.pairWalletConnectUri(message.data as WalletConnectPairInput);
			},
			"walletconnect.disconnect": async (message) => {
				return walletConnect.disconnectWalletConnectSession(
					message.data as WalletConnectDisconnectInput,
				);
			},
		},
	});

	updateBadgeOnStorageChange();
	initNotificationManagement();
};

void init();
