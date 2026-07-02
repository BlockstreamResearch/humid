import browser from "webextension-polyfill";

import { createAccountRegistry } from "@/core/accounts/application/account-registry";
import type { AccountModelState } from "@/core/accounts/application/account-registry/model/account-model";
import type {
	ActivityPage,
	GetActivityInput,
	PortfolioSnapshot,
	ReceiveAddress,
} from "@/core/accounts/application/accounts-rpc/model/types";
import type { Caip25Scopes } from "@/core/caip25";
import { getUnlockedChainStoreState } from "@/core/chains/application/chain-store/secureChainStore";
import { resolveUnlockedLiquidChain } from "@/core/chains/liquid/chains/resolveLiquidChain";
import type { LiquidScanTarget } from "@/core/chains/liquid/contract";
import { createLiquidChainGroup } from "@/core/chains/liquid/createLiquidChainGroup";
import { parseLiquidChainId } from "@/core/chains/liquid/domain/validation";
import { createConfirmationResponder } from "@/core/extension-background/confirmations";
import {
	createDappAuthorization,
	type DappRequestDispatch,
	type SupportedDappScope,
} from "@/core/extension-background/dapp-authorization";
import { createInjectedRpcHandlers } from "@/core/extension-background/injected-rpc";
import {
	createInternalRpcHandlers,
	syncWalletVaultAuthStore,
} from "@/core/extension-background/internal-rpc";
import { createPortfolioSyncEngine } from "@/core/extension-background/portfolio-sync/createPortfolioSyncEngine";
import { createSessionPortfolioSnapshotStore } from "@/core/extension-background/portfolio-sync/portfolioSnapshotStore";
import { createSessionScanTargetStore } from "@/core/extension-background/portfolio-sync/scanTargetStore";
import {
	registerBackgroundRpc,
	setupBackgroundTransport,
} from "@/core/extension-background/transport";
import { walletVaultBackground } from "@/core/secure-vault/application/wallet-vault/background";
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

/** MV3 alarm that refreshes the last-active account's balances while the popup is closed. */
const PORTFOLIO_REFRESH_ALARM = "portfolio-refresh";
const PORTFOLIO_REFRESH_PERIOD_MINUTES = 1;

/** Skip a background refresh if the cached snapshot was synced within this window. */
const BACKGROUND_REFRESH_MIN_INTERVAL_MS = 60_000;

const init = async () => {
	const messageBus = setupBackgroundTransport();

	await authStore.backendReady();

	syncWalletVaultAuthStore(await walletVaultBackground.initializeStorage());

	const confirmations = createConfirmationResponder(messageBus);
	const liquidChainGroup = createLiquidChainGroup();
	const accountRegistry = createAccountRegistry();

	// Liquid capability glue: keep the requested CAIP-25 scopes the Liquid chain
	// group can actually serve (valid chain ids + dispatcher methods).
	const resolveSupportedLiquidScope = (requested: Caip25Scopes): SupportedDappScope => {
		const supportedMethods = liquidChainGroup.walletRpcDispatcher.methods;
		const chains = new Set<string>();
		const methods = new Set<string>();

		for (const [scopeString, scopeObject] of Object.entries(requested)) {
			let chainId: string;

			try {
				chainId = parseLiquidChainId(scopeString);
			} catch {
				continue;
			}

			chains.add(chainId);

			for (const method of scopeObject.methods) {
				if (supportedMethods.includes(method)) methods.add(method);
			}
		}

		return { chains: [...chains], events: [], methods: [...methods] };
	};

	const dispatchInjectedLiquidRequest: DappRequestDispatch = async ({
		chainId,
		method,
		params,
	}) => {
		const liquidChainId = parseLiquidChainId(chainId);
		const chain = await resolveUnlockedLiquidChain(liquidChainId);

		return liquidChainGroup.walletRpcDispatcher.dispatch(
			{ method, params },
			{
				chain,
				confirm: confirmations.confirm,
				keyManagerState: walletVaultBackground.keyManager.getState(),
				updateKeyManagerState: walletVaultBackground.keyManager.updateState,
			},
		);
	};

	// Popup account runtime: resolve the selected Liquid chain + account into the input the
	// chain group's runtime facade needs (materialize + derive against it), plus the
	// identifiers that key the portfolio cache.
	const resolveSelectedLiquidAccount = async () => {
		const chainStore = await getUnlockedChainStoreState();
		const selectedChainId =
			chainStore.selectedChainIds[liquidChainGroup.id] ?? liquidChainGroup.chains[0].id;
		const chain = await resolveUnlockedLiquidChain(parseLiquidChainId(selectedChainId));
		const keyManagerState = walletVaultBackground.keyManager.getState();
		const selectedGroup = accountRegistry.getSelectedAccountGroup(keyManagerState.accountModel);
		const selectedWallet = keyManagerState.accountModel.wallets[selectedGroup.walletId];

		return {
			accountGroupId: selectedGroup.id,
			chainId: chain.id,
			input: {
				accountGroupIndex: selectedGroup.groupIndex ?? 0,
				chain,
				keySourceId: selectedWallet?.keySourceId,
				keyManagerState,
				updateKeyManagerState: walletVaultBackground.keyManager.updateState,
			},
		};
	};

	const getReceiveAddress = async (): Promise<ReceiveAddress> =>
		liquidChainGroup.accountRuntime.getReceiveAddress((await resolveSelectedLiquidAccount()).input);

	// Persisted portfolio (survives SW sleep) + the last-active watch-only scan target (so the
	// background alarm can refresh without the vault). Both live in session storage.
	const snapshotStore = createSessionPortfolioSnapshotStore();
	const scanTargetStore = createSessionScanTargetStore<LiquidScanTarget>();

	// Decouple portfolio reads from wallet scans: the popup polls `getPortfolio`, which returns the
	// cached balance instantly while the engine (re)syncs in the background. Each sync also caches
	// the account's watch-only scan target so the background alarm below can refresh it vault-free.
	const portfolioSync = createPortfolioSyncEngine(async () => {
		const { accountGroupId, chainId, input } = await resolveSelectedLiquidAccount();
		const key = `${accountGroupId}::${chainId}`;

		return {
			key,
			scan: async () => {
				const target = await liquidChainGroup.accountRuntime.resolveScanTarget(input);
				void scanTargetStore.save(key, target);

				return liquidChainGroup.accountRuntime.scanPortfolio(target);
			},
		};
	}, snapshotStore);

	// Refresh the last-active account in the background without the vault: scan its cached watch-only
	// target and persist the snapshot. Skips when nothing is cached or the snapshot is still fresh.
	const backgroundRefresh = async (): Promise<void> => {
		const active = await scanTargetStore.load();

		if (!active) return;

		const persisted = await snapshotStore.load(active.key);

		if (persisted && Date.now() - persisted.syncedAt < BACKGROUND_REFRESH_MIN_INTERVAL_MS) return;

		const portfolio = await liquidChainGroup.accountRuntime.scanPortfolio(active.target);

		await snapshotStore.save(active.key, { data: portfolio, syncedAt: Date.now() });
	};

	const getPortfolio = (): Promise<PortfolioSnapshot> => portfolioSync.getSnapshot();

	// On-demand, paginated activity for one asset on the selected account+chain. Read straight
	// from the scan worker's cached wollet (no scan), decoupled from the portfolio balance poll.
	const getActivity = async (input: GetActivityInput): Promise<ActivityPage> => {
		const { input: accountInput } = await resolveSelectedLiquidAccount();

		return liquidChainGroup.accountRuntime.getActivity(
			accountInput,
			input.rawAssetId,
			input.cursor,
		);
	};

	const dappAuthorization = createDappAuthorization({
		confirm: confirmations.confirm,
		dispatch: dispatchInjectedLiquidRequest,
		getAccountModel,
		registry: accountRegistry,
		resolveSupportedScope: resolveSupportedLiquidScope,
		updateAccountModel,
	});

	walletConnect.registerWalletConnectNamespaceAdapter(liquidChainGroup.walletConnectAdapter);

	await walletConnect.initializeWalletConnectBackground({
		confirm: confirmations.confirm,
	});

	registerBackgroundRpc(messageBus, {
		injected: createInjectedRpcHandlers({ authorization: dappAuthorization }),
		popup: createInternalRpcHandlers({
			chainGroups: [liquidChainGroup],
			confirmations,
			getActivity,
			getPortfolio,
			getReceiveAddress,
		}),
	});

	updateBadgeOnStorageChange();
	initNotificationManagement();

	// Create the periodic background-refresh alarm once (it persists across SW sleeps); guarding on
	// get() avoids resetting its schedule every time the SW wakes and re-runs init.
	if (!(await browser.alarms.get(PORTFOLIO_REFRESH_ALARM))) {
		await browser.alarms.create(PORTFOLIO_REFRESH_ALARM, {
			periodInMinutes: PORTFOLIO_REFRESH_PERIOD_MINUTES,
		});
	}

	return { backgroundRefresh };
};

// Run the background setup once per service-worker lifetime; the alarm listener awaits it.
let initialization: ReturnType<typeof init> | null = null;
const ensureInitialized = (): ReturnType<typeof init> => (initialization ??= init());

// Registered at the top level so it catches the alarm that wakes the service worker. The refresh is
// watch-only (scans a cached descriptor), so it works even though the vault re-locks on SW sleep.
browser.alarms.onAlarm.addListener(async (alarm) => {
	if (alarm.name !== PORTFOLIO_REFRESH_ALARM) return;

	try {
		const { backgroundRefresh } = await ensureInitialized();

		await backgroundRefresh();
	} catch (error) {
		console.error("[liquid-sync] background refresh failed", error);
	}
});

void ensureInitialized();
