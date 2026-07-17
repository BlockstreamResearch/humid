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

/** Wrap popup handlers so any popup-context request counts as wallet activity (resets idle lock). */
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

/** MV3 alarm that refreshes the last-active account's balances while the popup is closed. */
const PORTFOLIO_REFRESH_ALARM = "portfolio-refresh";
const PORTFOLIO_REFRESH_PERIOD_MINUTES = 1;

/** Skip a background refresh if the cached snapshot was synced within this window. */
const BACKGROUND_REFRESH_MIN_INTERVAL_MS = 60_000;

const init = async () => {
	const { eventBus, messageBus } = setupBackgroundTransport();

	// Capture the event bus so the wallet-event broadcaster can push provider events (accountsChanged,
	// chainChanged, …) to dapps over both transports: injected (window.humid.on) and, via this sink,
	// WalletConnect (per-session). The WC sink no-ops until the WalletConnect client is up (below).
	initWalletEventBroadcaster(eventBus, (event, payload) => {
		void walletConnect.emitWalletConnectWalletEvent(event, payload).catch(() => undefined);
	});

	await authStore.backendReady();

	syncWalletVaultAuthStore(await walletVaultBackground.initializeStorage());

	const confirmations = createConfirmationResponder(messageBus);
	// Adapter for callers that only need approval (method + WalletConnect confirmations): run the
	// universal confirm and collapse its decision to a boolean.
	const confirmApproved = (request: ConfirmationRequest): Promise<boolean> =>
		confirmations.confirm(request).then((decision) => decision.approved);
	const liquidChainGroup = createLiquidChainGroup();
	const accountRegistry = createAccountRegistry();

	// The Liquid chain ids the wallet can actually serve right now: the built-ins (always) plus any
	// stored custom chains — the latter only readable while unlocked, so a locked connect falls back
	// to built-ins only (a custom chain requested then is simply not granted; built-ins always are).
	const readKnownLiquidChainIds = async (): Promise<Set<string>> => {
		const ids = new Set<string>(liquidChainGroup.chains.map((chain) => chain.id));

		try {
			const store = await getUnlockedChainStoreState();

			for (const chain of Object.values(store.chains)) {
				if (chain.chainGroupId === liquidChainGroup.id) ids.add(chain.id);
			}
		} catch {
			// Vault locked / store unavailable: built-in chains only.
		}

		return ids;
	};

	// Liquid scope glue: keep the requested CAIP-25 scopes the Liquid chain group can actually
	// serve — valid chain ids the wallet KNOWS (built-in ∪ stored) + dispatcher methods. Gating on
	// known chains means a session can only be GRANTED chains the wallet can serve; an unknown or
	// dapp-supplied chain id never enters a granted scope (the invoke-time hard gate and the
	// dispatch-time resolveUnlockedLiquidChain throw stay as the backstops).
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

			// Tightened: only grant chains the wallet can actually serve.
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

	// Persisted portfolio (survives SW sleep) + the last-active watch-only scan target (so the
	// background alarm can refresh without the vault). Both live in session storage. Created above the
	// dispatchers so the injected dapp read path can serve balances/UTXOs from the snapshot below.
	const snapshotStore = createSessionPortfolioSnapshotStore();
	const scanTargetStore = createSessionScanTargetStore<LiquidScanTarget>();

	// Serve dapp reads (getBalance/getUTXOs) from the persisted snapshot when one exists for the target
	// account+chain; a miss leaves the method on its live-scan path, and reads never trigger a sync.
	// KEEP IN SYNC with the engine key built in `portfolioSync` below (`${accountGroupId}::${chainId}`).
	const readPortfolioSnapshot = (accountGroupId: string, chainId: string) =>
		snapshotStore.load(`${accountGroupId}::${chainId}`);

	// Garbage-collect a removed account's session-storage portfolio: every chain's persisted snapshot
	// for the group, plus the single-slot scan target. The scan target is a "last-active" cache, so we
	// clear it unconditionally on any removal rather than trying to prove it pointed at this account:
	// it is re-populated by the very next popup scan (removal happens in the open popup, so that scan is
	// imminent) — clearing can never serve stale data, and at worst skips one background refresh cycle.
	// Best-effort: both stores swallow their own storage errors, so this never throws. Lives at the
	// composition root so the forthcoming forget-wallet flow can call it per removed account group.
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

	// In-extension send: preview then execute against the SELECTED account (resolved exactly like
	// getReceiveAddress). Both call the chain group's runtime, which calls the same backend fns the
	// dapp path uses — but WITHOUT the dapp confirmation popup, because the popup's own review screen
	// is the confirmation. inspectTransfer never signs/broadcasts; sendTransfer syncs, builds, signs,
	// and broadcasts via the offscreen document (that broadcast path is unchanged).
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

	// Max-send estimate for the selected account: the runtime syncs, then either returns the full
	// issued-asset balance or drains L-BTC to read the fee (see `accountRuntime.estimateMaxSend`).
	const estimateMaxSend = async (input: EstimateMaxSendInput): Promise<EstimateMaxSendResult> =>
		liquidChainGroup.accountRuntime.estimateMaxSend(
			(await resolveSelectedLiquidAccount()).input,
			input,
		);

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
	// target and persist the snapshot. Skips when nothing is cached, the snapshot is still fresh, the
	// popup's engine is already scanning this key, or a previous background refresh is still running —
	// so the alarm never runs a scan concurrent with (or stacked on) another (which would burst the
	// esplora endpoint into a 429).
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

	// Manual refresh: force an immediate re-sync of the selected account's portfolio (bypasses the
	// engine's time throttle, still single-flighted) and return the fresh snapshot to the popup.
	const refreshPortfolio = (): Promise<PortfolioSnapshot> => portfolioSync.refresh();

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

	// Resolve (and materialize) the CAIP-10 account ids the granted account groups map to on a chain,
	// so the connect result can advertise them (no follow-up descriptor read + approval at connect).
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

	// Connected-dapps viewer plumbing. Injected sessions store their account groups directly; a
	// WalletConnect session stores CAIP-10 accounts, so map those back to account groups (via the same
	// Liquid resolver the WC request path uses) so both transports list under the same accounts.
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

	// Prune a removed account's WalletConnect sessions. Resolve which live sessions the removed account
	// groups authorize FIRST (synchronously) — the caller runs this BEFORE the model mutation deletes
	// the chain accounts WC session→account resolution matches on. Policy (v1, no per-account WC
	// pruning): disconnect a session only when its SOLE authorized account group is being removed; a
	// multi-account session is left intact and a warning notes it. Best-effort: a failed disconnect must
	// never abort the account removal that follows.
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

	// Validate a dapp-proposed Liquid chain (throws on bad params) and hand back its display fields plus
	// a commit that — only on approval — mints the wallet's OWN id, re-checks for a duplicate (the same
	// guard the popup add-chain path uses), and persists it. Liquid/chain-store specifics live here.
	const prepareLiquidChainAddition = (params: unknown): PreparedChainAddition => {
		// Validate via the same record parser the vault uses. The dapp-supplied `chainId` is IGNORED —
		// the wallet mints its OWN id on approval (below), so validate against a throwaway one (a custom
		// chain's network is defined by its settings, not its id, so the throwaway never affects it).
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

	// wallet_switchChain plumbing: is this a chain the wallet knows (built-in ∪ store)? Returns its
	// display name for the approval, or null → the dapp must call wallet_addChain first.
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
		// New injected sessions carry a default 30-day expiry; findDappSession drops them once lapsed.
		sessionTtlMs: DEFAULT_INJECTED_SESSION_TTL_MS,
		updateAccountModel,
	});

	walletConnect.registerWalletConnectNamespaceAdapter(liquidChainGroup.walletConnectAdapter);

	await walletConnect.initializeWalletConnectBackground({
		confirm: confirmApproved,
		// Same snapshot reader wired into the injected dapp path above: WC getBalance/getUTXOs now
		// serve from the persisted snapshot (no live scan) when the target account has one.
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
	// Cancel a pending confirmation when the user closes the notification window (so an abandoned
	// connect/sign prompt doesn't wedge the dapp's request until the timeout).
	initNotificationManagement(() => confirmations.cancelActive());

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

// Registered at the top level so it catches the alarm that wakes the service worker: it enforces the
// idle auto-lock and runs the watch-only portfolio refresh (which works whether or not the vault is
// unlocked).
browser.alarms.onAlarm.addListener(async (alarm) => {
	if (alarm.name !== PORTFOLIO_REFRESH_ALARM) return;

	try {
		const { backgroundRefresh } = await ensureInitialized();

		const locked = await walletVaultBackground.enforceAutoLock();

		// Idle auto-lock hit — mirror it to dapps like a manual lock (they re-query and get an empty
		// set while the vault stays locked).
		if (locked) emitWalletEvent("accountsChanged");

		await backgroundRefresh();
	} catch (error) {
		console.error("[liquid-sync] background refresh failed", error);
	}
});

void ensureInitialized();
