import browser from "webextension-polyfill";

import { createAccountRegistry } from "@/core/accounts/application/account-registry";
import type { AccountModelState } from "@/core/accounts/application/account-registry/model/account-model";
import type {
	ActivityPage,
	EstimateMaxSendInput,
	EstimateMaxSendResult,
	GetActivityInput,
	PortfolioSnapshot,
	ReceiveAddress,
	SendTransferInput,
	SendTransferResult,
	TransferReview,
} from "@/core/accounts/application/accounts-rpc/model/types";
import type { Caip25Scopes } from "@/core/caip25";
import { addUnlockedChainRecord } from "@/core/chains/application/chain-store/addChainRecord";
import { getUnlockedChainStoreState } from "@/core/chains/application/chain-store/secureChainStore";
import {
	type LiquidContractIdentity,
	readLiquidContractIdentity,
} from "@/core/chains/liquid/application/contractIdentity";
import {
	buildLiquidDappAccountScope,
	resolveAccountGroupIdsForIdentifiers,
} from "@/core/chains/liquid/application/dappAccountScope";
import { generateCustomLiquidChainId } from "@/core/chains/liquid/chains/createBuiltInLiquidChains";
import {
	LIQUID_CHAIN_GROUP_ID,
	parseLiquidChainRecord,
} from "@/core/chains/liquid/chains/LiquidChainRecord";
import { resolveUnlockedLiquidChain } from "@/core/chains/liquid/chains/resolveLiquidChain";
import type { LiquidScanTarget } from "@/core/chains/liquid/contract";
import { createLiquidChainGroup } from "@/core/chains/liquid/createLiquidChainGroup";
import { LIQUID_WALLETCONNECT_EVENTS } from "@/core/chains/liquid/domain/LiquidRpc";
import { parseLiquidChainId } from "@/core/chains/liquid/domain/validation";
import { createConfirmationResponder } from "@/core/extension-background/confirmations";
import {
	createDappAuthorization,
	createDappConnectInternalHandlers,
	createDappSessionsInternalHandlers,
	type DappRequestDispatch,
	DEFAULT_INJECTED_SESSION_TTL_MS,
	type PreparedChainAddition,
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
	type RequestHandlerMap,
	setupBackgroundTransport,
} from "@/core/extension-background/transport";
import {
	emitWalletEvent,
	initWalletEventBroadcaster,
} from "@/core/extension-background/wallet-events";
import { walletVaultBackground } from "@/core/secure-vault/application/wallet-vault/background";
import { touchVaultActivity } from "@/core/secure-vault/background";
import * as walletConnect from "@/core/walletconnect/background";
import type { WalletConnectSessionSummary } from "@/core/walletconnect/types";
import {
	type ConfirmationRequest,
	initNotificationManagement,
	updateBadgeOnStorageChange,
} from "@/helpers/background";
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

const BACKGROUND_REFRESH_MIN_INTERVAL_MS = 60_000;

const init = async () => {
	const { eventBus, messageBus } = setupBackgroundTransport();

	initWalletEventBroadcaster(eventBus, (event, payload) => {
		void walletConnect.emitWalletConnectWalletEvent(event, payload).catch(() => undefined);
	});

	await authStore.backendReady();

	syncWalletVaultAuthStore(await walletVaultBackground.initializeStorage());

	const confirmations = createConfirmationResponder(messageBus);
	const confirmApproved = (request: ConfirmationRequest): Promise<boolean> =>
		confirmations.confirm(request).then((decision) => decision.approved);
	const liquidChainGroup = createLiquidChainGroup();
	const accountRegistry = createAccountRegistry();

	const readKnownLiquidChainIds = async (): Promise<Set<string>> => {
		const ids = new Set<string>(liquidChainGroup.chains.map((chain) => chain.id));

		try {
			const store = await getUnlockedChainStoreState();

			for (const chain of Object.values(store.chains)) {
				if (chain.chainGroupId === liquidChainGroup.id) ids.add(chain.id);
			}
		} catch {}

		return ids;
	};

	const resolveSupportedLiquidScope = async (
		requested: Caip25Scopes,
	): Promise<SupportedDappScope> => {
		const supportedMethods = liquidChainGroup.walletRpcDispatcher.methods;
		const knownChainIds = await readKnownLiquidChainIds();
		const chains = new Set<string>();
		const methods = new Set<string>();

		for (const [scopeString, scopeObject] of Object.entries(requested)) {
			let chainId: string;

			try {
				chainId = parseLiquidChainId(scopeString);
			} catch {
				continue;
			}

			if (!knownChainIds.has(chainId)) continue;

			chains.add(chainId);

			for (const method of scopeObject.methods) {
				if (supportedMethods.includes(method)) methods.add(method);
			}
		}

		return {
			chains: [...chains],
			events: [...LIQUID_WALLETCONNECT_EVENTS],
			methods: [...methods],
		};
	};

	const snapshotStore = createSessionPortfolioSnapshotStore();
	const scanTargetStore = createSessionScanTargetStore<LiquidScanTarget>();

	const readPortfolioSnapshot = (accountGroupId: string, chainId: string) =>
		snapshotStore.load(`${accountGroupId}::${chainId}`);

	const purgeAccountPortfolio = async (accountGroupId: string): Promise<void> => {
		await snapshotStore.removeForAccountGroup(accountGroupId);
		await scanTargetStore.clear();
	};

	const dispatchInjectedLiquidRequest: DappRequestDispatch = async ({
		accountGroupIds,
		chainId,
		grantedMethods,
		method,
		params,
	}) => {
		const liquidChainId = parseLiquidChainId(chainId);
		const chain = await resolveUnlockedLiquidChain(liquidChainId);
		const keyManagerState = walletVaultBackground.keyManager.getState();

		return liquidChainGroup.walletRpcDispatcher.dispatch(
			{ method, params },
			{
				accountScope: buildLiquidDappAccountScope({
					accountGroupIds,
					accountModel: keyManagerState.accountModel,
					chainId: liquidChainId,
				}),
				authorization: { isGranted: (methodId) => grantedMethods[methodId] === true },
				chain,
				confirm: confirmApproved,
				keyManagerState,
				readPortfolioSnapshot,
				updateKeyManagerState: walletVaultBackground.keyManager.updateState,
			},
		);
	};

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
				accountGroupId: selectedGroup.id,
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

	const readContractIdentity = async (accountGroupId?: string): Promise<LiquidContractIdentity> => {
		const { input } = await resolveSelectedLiquidAccount();

		const group =
			accountGroupId === undefined
				? undefined
				: Object.values(input.keyManagerState.accountModel.accountGroups).find(
						(candidate) => candidate.id === accountGroupId,
					);

		if (accountGroupId !== undefined && !group) {
			throw new Error(`No account group ${accountGroupId}.`);
		}

		const keySourceId = group
			? input.keyManagerState.accountModel.wallets[group.walletId]?.keySourceId
			: input.keySourceId;

		return readLiquidContractIdentity({
			accountGroupIndex: group ? (group.groupIndex ?? 0) : input.accountGroupIndex,
			chain: input.chain,
			keyManagerState: input.keyManagerState,
			...(keySourceId === undefined ? {} : { keySourceId }),
		});
	};

	const inspectTransfer = async (input: SendTransferInput): Promise<TransferReview> =>
		liquidChainGroup.accountRuntime.inspectTransfer(
			(await resolveSelectedLiquidAccount()).input,
			input,
		);

	const sendTransfer = async (input: SendTransferInput): Promise<SendTransferResult> =>
		liquidChainGroup.accountRuntime.sendTransfer(
			(await resolveSelectedLiquidAccount()).input,
			input,
		);

	const estimateMaxSend = async (input: EstimateMaxSendInput): Promise<EstimateMaxSendResult> =>
		liquidChainGroup.accountRuntime.estimateMaxSend(
			(await resolveSelectedLiquidAccount()).input,
			input,
		);

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

	let backgroundRefreshInFlight = false;
	const backgroundRefresh = async (): Promise<void> => {
		if (backgroundRefreshInFlight) return;

		const active = await scanTargetStore.load();

		if (!active) return;
		if (portfolioSync.isSyncing(active.key)) return;

		const persisted = await snapshotStore.load(active.key);

		if (persisted && Date.now() - persisted.syncedAt < BACKGROUND_REFRESH_MIN_INTERVAL_MS) return;

		backgroundRefreshInFlight = true;

		try {
			const portfolio = await liquidChainGroup.accountRuntime.scanPortfolio(active.target);

			await snapshotStore.save(active.key, { data: portfolio, syncedAt: Date.now() });
		} finally {
			backgroundRefreshInFlight = false;
		}
	};

	const getPortfolio = (): Promise<PortfolioSnapshot> => portfolioSync.getSnapshot();

	const refreshPortfolio = (): Promise<PortfolioSnapshot> => portfolioSync.refresh();

	const getActivity = async (input: GetActivityInput): Promise<ActivityPage> => {
		const { input: accountInput } = await resolveSelectedLiquidAccount();

		return liquidChainGroup.accountRuntime.getActivity(
			accountInput,
			input.rawAssetId,
			input.cursor,
		);
	};

	const resolveConnectedAccountIds = async (
		chainId: string,
		accountGroupIds: readonly string[],
	): Promise<string[]> => {
		let liquidChainId;

		try {
			liquidChainId = parseLiquidChainId(chainId);
		} catch {
			return [];
		}

		const chain = await resolveUnlockedLiquidChain(liquidChainId);
		const keyManagerState = walletVaultBackground.keyManager.getState();
		const { accountModel } = keyManagerState;
		const accountIds: string[] = [];

		for (const accountGroupId of accountGroupIds) {
			const group = Object.values(accountModel.accountGroups).find(
				(candidate) => candidate.id === accountGroupId,
			);

			if (!group) continue;

			accountIds.push(
				await liquidChainGroup.accountRuntime.resolveAccountIdentifier({
					accountGroupId: group.id,
					accountGroupIndex: group.groupIndex ?? 0,
					chain,
					keySourceId: accountModel.wallets[group.walletId]?.keySourceId,
					keyManagerState,
					updateKeyManagerState: walletVaultBackground.keyManager.updateState,
				}),
			);
		}

		return accountIds;
	};

	const listWalletConnectSessions = (): WalletConnectSessionSummary[] =>
		walletConnect.getWalletConnectStatus().sessions;

	const resolveWalletConnectAccountGroupIds = (session: WalletConnectSessionSummary): string[] => {
		const accountModel = getAccountModel();

		if (!accountModel) return [];

		const accountsByChain = new Map<string, string[]>();

		for (const scope of Object.values(session.namespaces)) {
			for (const account of scope.accounts) {
				const chainId = account.split(":").slice(0, 2).join(":");
				const accounts = accountsByChain.get(chainId) ?? [];
				accounts.push(account);
				accountsByChain.set(chainId, accounts);
			}
		}

		const accountGroupIds = new Set<string>();

		for (const [chainId, accounts] of accountsByChain) {
			let liquidChainId;

			try {
				liquidChainId = parseLiquidChainId(chainId);
			} catch {
				continue;
			}

			for (const groupId of resolveAccountGroupIdsForIdentifiers(
				accountModel,
				liquidChainId,
				accounts,
			)) {
				accountGroupIds.add(groupId);
			}
		}

		return [...accountGroupIds];
	};

	const disconnectWalletConnect = async (topic: string): Promise<void> => {
		await walletConnect.disconnectWalletConnectSession({ topic });
	};

	const purgeAccountWalletConnectSessions = async (
		accountGroupIds: readonly string[],
	): Promise<void> => {
		const removed = new Set(accountGroupIds);

		if (removed.size === 0) return;

		const topicsToDisconnect: string[] = [];

		for (const session of listWalletConnectSessions()) {
			const authorized = resolveWalletConnectAccountGroupIds(session);

			if (!authorized.some((id) => removed.has(id))) continue;

			if (authorized.length === 1) {
				topicsToDisconnect.push(session.topic);
			} else {
				console.warn(
					`[walletconnect] session ${session.topic} authorizes multiple accounts; left intact after account removal (no per-account WalletConnect pruning yet)`,
				);
			}
		}

		await Promise.all(
			topicsToDisconnect.map((topic) =>
				disconnectWalletConnect(topic).catch((error) =>
					console.warn(`[walletconnect] failed to disconnect session ${topic}`, error),
				),
			),
		);
	};

	const prepareLiquidChainAddition = (params: unknown): PreparedChainAddition => {
		const proposal =
			params && typeof params === "object" ? (params as Record<string, unknown>) : {};
		const proposed = parseLiquidChainRecord({
			chainGroupId: LIQUID_CHAIN_GROUP_ID,
			id: generateCustomLiquidChainId(),
			name: proposal.name,
			settings: proposal.settings,
		});

		return {
			backendUrl: proposed.settings.backend.url,
			name: proposed.name,
			network: proposed.settings.network,
			commit: async () => {
				const chainId = generateCustomLiquidChainId();

				await addUnlockedChainRecord(
					{
						chainGroupId: LIQUID_CHAIN_GROUP_ID,
						id: chainId,
						name: proposed.name,
						settings: proposed.settings,
					},
					[liquidChainGroup],
				);

				return chainId;
			},
		};
	};

	const resolveKnownLiquidChain = async (chainId: string): Promise<{ name: string } | null> => {
		const builtIn = liquidChainGroup.chains.find((chain) => chain.id === chainId);

		if (builtIn) return { name: builtIn.name };

		try {
			const stored = (await getUnlockedChainStoreState()).chains[chainId];

			return stored && stored.chainGroupId === liquidChainGroup.id ? { name: stored.name } : null;
		} catch {
			return null;
		}
	};

	const dappAuthorization = createDappAuthorization({
		confirm: confirmations.confirm,
		dispatch: dispatchInjectedLiquidRequest,
		getAccountModel,
		prepareChainAddition: prepareLiquidChainAddition,
		registry: accountRegistry,
		resolveConnectedAccountIds,
		resolveKnownChain: resolveKnownLiquidChain,
		resolveSupportedScope: resolveSupportedLiquidScope,
		sessionTtlMs: DEFAULT_INJECTED_SESSION_TTL_MS,
		updateAccountModel,
	});

	walletConnect.registerWalletConnectNamespaceAdapter(liquidChainGroup.walletConnectAdapter);

	await walletConnect.initializeWalletConnectBackground({
		confirm: confirmApproved,
		readPortfolioSnapshot,
	});

	registerBackgroundRpc(messageBus, {
		injected: createInjectedRpcHandlers({ authorization: dappAuthorization }),
		popup: withVaultActivityTouch({
			...createInternalRpcHandlers({
				chainGroups: [liquidChainGroup],
				confirmations,
				estimateMaxSend,
				getActivity,
				getPortfolio,
				getReceiveAddress,
				readContractIdentity,
				inspectTransfer,
				purgeAccountPortfolio,
				purgeAccountWalletConnectSessions,
				refreshPortfolio,
				sendTransfer,
			}),
			...createDappConnectInternalHandlers({ getAccountModel, registry: accountRegistry }),
			...createDappSessionsInternalHandlers({
				disconnectWalletConnect,
				getAccountModel,
				listWalletConnectSessions,
				registry: accountRegistry,
				resolveWalletConnectAccountGroupIds,
				updateAccountModel,
			}),
		}),
	});

	updateBadgeOnStorageChange();
	initNotificationManagement(() => confirmations.cancelActive());

	if (!(await browser.alarms.get(PORTFOLIO_REFRESH_ALARM))) {
		await browser.alarms.create(PORTFOLIO_REFRESH_ALARM, {
			periodInMinutes: PORTFOLIO_REFRESH_PERIOD_MINUTES,
		});
	}

	return { backgroundRefresh };
};

let initialization: ReturnType<typeof init> | null = null;
const ensureInitialized = (): ReturnType<typeof init> => (initialization ??= init());

browser.alarms.onAlarm.addListener(async (alarm) => {
	if (alarm.name !== PORTFOLIO_REFRESH_ALARM) return;

	try {
		const { backgroundRefresh } = await ensureInitialized();

		const locked = await walletVaultBackground.enforceAutoLock();

		if (locked) emitWalletEvent("accountsChanged");

		await backgroundRefresh();
	} catch (error) {
		console.error("[liquid-sync] background refresh failed", error);
	}
});

void ensureInitialized();
