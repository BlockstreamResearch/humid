import browser from "webextension-polyfill";

import { createAccountRegistry } from "@/core/accounts/application/account-registry";
import type { AccountModelState } from "@/core/accounts/application/account-registry/model/account-model";
import { createLiquidBackground } from "@/core/chains/liquid/background";
import { createLiquidChainGroup } from "@/core/chains/liquid/createLiquidChainGroup";
import { createConfirmationResponder } from "@/core/extension-background/confirmations";
import {
	createDappAuthorization,
	createDappConnectInternalHandlers,
	createDappSessionsInternalHandlers,
	DEFAULT_INJECTED_SESSION_TTL_MS,
} from "@/core/extension-background/dapp-authorization";
import { createInjectedRpcHandlers } from "@/core/extension-background/injected-rpc";
import {
	createInternalRpcHandlers,
	syncWalletVaultAuthStore,
} from "@/core/extension-background/internal-rpc";
import { type PageRequestHandler, servePagePorts } from "@/core/extension-background/page-port";
import {
	registerPopupRpc,
	type RequestHandlerMap,
	setupBackgroundTransport,
} from "@/core/extension-background/transport";
import {
	emitWalletEvent,
	initWalletEventBroadcaster,
} from "@/core/extension-background/wallet-events";
import { logger } from "@/core/logger";
import { walletVaultBackground } from "@/core/secure-vault/application/wallet-vault/background";
import { touchVaultActivity } from "@/core/secure-vault/background";
import * as walletConnect from "@/core/walletconnect/background";
import { initNotificationManagement, updateBadgeOnStorageChange } from "@/helpers/background";
import { authStore } from "@/store/auth";

export type {
	PegasusEventProtocolMap,
	PegasusMsgProtocolMap,
} from "@/core/extension-background/transport";

function getAccountModel(): AccountModelState | null {
	try {
		return walletVaultBackground.keyManager.getState().accountModel;
	} catch {
		return null;
	}
}

async function updateAccountModel(
	update: (accountModel: AccountModelState) => AccountModelState,
): Promise<AccountModelState> {
	const state = await walletVaultBackground.keyManager.updateState((current) => ({
		...current,
		accountModel: update(current.accountModel),
	}));

	return state.accountModel;
}

function withVaultActivityTouch(handlers: RequestHandlerMap): RequestHandlerMap {
	return Object.fromEntries(
		Object.entries(handlers).map(([method, handler]) => [
			method,
			(message, sender) => {
				void touchVaultActivity();

				return handler(message, sender);
			},
		]),
	);
}

const PORTFOLIO_REFRESH_ALARM = "portfolio-refresh";
const PORTFOLIO_REFRESH_PERIOD_MINUTES = 1;

const init = async () => {
	const { messageBus } = setupBackgroundTransport();
	let servePages!: (handlers: Record<string, PageRequestHandler>) => void;
	const pages = servePagePorts(new Promise((resolve) => (servePages = resolve)));

	initWalletEventBroadcaster(pages, (event, payload) => {
		void walletConnect.emitWalletConnectWalletEvent(event, payload).catch(() => undefined);
	});

	await authStore.backendReady();

	syncWalletVaultAuthStore(await walletVaultBackground.initializeStorage());

	const confirmations = createConfirmationResponder(messageBus, {
		isUnlocked: async () => (await walletVaultBackground.getStatus()).isUnlocked,
		noteActivity: () => void touchVaultActivity(),
		onUnlocked: walletVaultBackground.onUnlocked,
	});
	const liquidChainGroup = createLiquidChainGroup();
	const accountRegistry = createAccountRegistry();
	const liquid = createLiquidBackground({
		chainGroup: liquidChainGroup,
		confirm: confirmations.confirm,
		getAccountModel,
		registry: accountRegistry,
	});

	const dappAuthorization = createDappAuthorization({
		...liquid.dapps,
		confirm: confirmations.confirm,
		getAccountModel,
		registry: accountRegistry,
		sessionTtlMs: DEFAULT_INJECTED_SESSION_TTL_MS,
		updateAccountModel,
		waitForUnlock: confirmations.waitForUnlock,
	});

	walletConnect.registerWalletConnectNamespaceAdapter(liquidChainGroup.walletConnectAdapter);

	await walletConnect.initializeWalletConnectBackground({
		confirm: confirmations.confirm,
		readPortfolioSnapshot: liquid.portfolio.readSnapshot,
		waitForUnlock: confirmations.waitForUnlock,
	});

	servePages(createInjectedRpcHandlers(dappAuthorization));
	registerPopupRpc(
		messageBus,
		withVaultActivityTouch({
			...createInternalRpcHandlers({
				...liquid.wallet,
				chainGroups: [liquidChainGroup],
				confirmations,
				getPortfolio: liquid.portfolio.getPortfolio,
				purgeAccountPortfolio: liquid.portfolio.purgeAccountPortfolio,
				purgeAccountWalletConnectSessions: liquid.walletConnect.purgeAccountWalletConnectSessions,
				refreshPortfolio: liquid.portfolio.refreshPortfolio,
			}),
			...createDappConnectInternalHandlers({ getAccountModel, registry: accountRegistry }),
			...createDappSessionsInternalHandlers({
				...liquid.walletConnect,
				getAccountModel,
				registry: accountRegistry,
				updateAccountModel,
			}),
		}),
	);

	updateBadgeOnStorageChange();
	initNotificationManagement(() => confirmations.cancelAll());

	if (!(await browser.alarms.get(PORTFOLIO_REFRESH_ALARM))) {
		await browser.alarms.create(PORTFOLIO_REFRESH_ALARM, {
			periodInMinutes: PORTFOLIO_REFRESH_PERIOD_MINUTES,
		});
	}

	return { refreshInBackground: liquid.portfolio.refreshInBackground };
};

let initialization: ReturnType<typeof init> | null = null;
const ensureInitialized = (): ReturnType<typeof init> => (initialization ??= init());

browser.alarms.onAlarm.addListener(async (alarm) => {
	if (alarm.name !== PORTFOLIO_REFRESH_ALARM) return;

	try {
		const { refreshInBackground } = await ensureInitialized();

		const locked = await walletVaultBackground.enforceAutoLock();

		if (locked) emitWalletEvent("accountsChanged");

		await refreshInBackground();
	} catch (error) {
		logger.error("[liquid-sync] background refresh failed", error);
	}
});

void ensureInitialized();
