import type { AccountRegistry } from "@/core/accounts/application/account-registry/AccountRegistry";
import type { AccountGroupRecord } from "@/core/accounts/application/account-registry/model/account-group";
import type { AccountModelState } from "@/core/accounts/application/account-registry/model/account-model";
import type { DappSessionScope } from "@/core/accounts/application/account-registry/model/dapp-session";
import type { AccountGroupId } from "@/core/accounts/application/account-registry/model/identifiers";
import {
	type Caip25CreateSessionParams,
	type Caip25CreateSessionResult,
	type Caip25GetSessionResult,
	type Caip25RevokeSessionResult,
	type Caip27InvokeMethodParams,
	mergeRequestedScopes,
	toCaip25Scopes,
} from "@/core/caip25";
import type { ConfirmationDecision, ConfirmationRequest } from "@/helpers/background";

import { emitWalletEvent } from "../wallet-events";
import {
	buildDappConnectAccounts,
	connectedAccountGroupIdsForOrigin,
	listConnectableAccountGroups,
	trySelectedAccountGroupId,
} from "./connectableAccounts";
import {
	DAPP_ADD_CHAIN_CONFIRMATION_KIND,
	DAPP_CONNECT_CONFIRMATION_KIND,
	DAPP_SWITCH_CHAIN_CONFIRMATION_KIND,
	type DappAddChainConfirmationData,
	type DappConnectConfirmationData,
	type DappConnectConfirmationResult,
	type DappSwitchChainConfirmationData,
} from "./connectConfirmation";
import { DappAuthorizationError, dappAuthorizationErrors } from "./errors";

const INJECTED_TRANSPORT = "injected" as const;

/**
 * Default lifetime for an injected dapp session: 30 days. Passed at the composition root so new
 * injected sessions carry an `expiresAt` and eventually lapse — `findDappSession` drops expired
 * sessions — instead of persisting until an explicit revoke. WalletConnect manages its own session
 * lifetime, so this is injected-only.
 */
export const DEFAULT_INJECTED_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Chain-derived part of a granted scope (chains + methods + notifications). */
export type SupportedDappScope = {
	chains: string[];
	events: string[];
	methods: string[];
};

/**
 * A validated, dapp-proposed chain ready to add (wallet_addChain). `commit` mints the wallet's OWN
 * id, rejects a duplicate, and persists it — it runs ONLY after the user approves the add-chain
 * confirmation, so validation (which produced the display fields) and persistence are separate
 * consents, and the dapp-supplied id is never trusted.
 */
export type PreparedChainAddition = {
	/** Esplora backend URL the wallet will hit — the security-sensitive field shown for approval. */
	backendUrl: string;
	/** Persist under a freshly minted, wallet-owned id; resolves to that id. Runs only on approval. */
	commit: () => Promise<string>;
	/** Proposed human-readable chain name. */
	name: string;
	/** Target network ("mainnet" | "testnet" | "regtest"). */
	network: string;
};

export type DappRequestDispatch = (request: {
	/** Account groups the session authorized; the chain binds execution to this set. */
	accountGroupIds: readonly string[];
	chainId: string;
	/**
	 * The session's authorized methods: `true` runs without asking, `false` confirms on every call.
	 * A method outside the map is not part of the session's surface.
	 */
	grantedMethods: Record<string, boolean>;
	method: string;
	params: unknown;
}) => Promise<unknown>;

export type DappAuthorizationDependencies = {
	/** Show a confirmation and resolve the user's decision (approval + optional typed result). */
	confirm: <TResult = unknown>(
		request: ConfirmationRequest,
	) => Promise<ConfirmationDecision<TResult>>;
	/** Executes an authorized chain request (chain resolution + context build). */
	dispatch: DappRequestDispatch;
	/** Current account model, or null when the vault is locked. */
	getAccountModel: () => AccountModelState | null;
	/**
	 * Validate a dapp-proposed chain (wallet_addChain) and return its display fields plus a `commit`
	 * that persists it under a freshly minted, wallet-owned id (never the dapp's). Chain-group
	 * specific; injected at the root. Throws on invalid params. Absent → wallet_addChain is refused.
	 */
	prepareChainAddition?: (params: unknown) => PreparedChainAddition;
	registry: AccountRegistry;
	/**
	 * Resolve a KNOWN chain (built-in ∪ store) by id for wallet_switchChain, returning its display
	 * name — or null when the wallet doesn't recognize it. Injected at the root.
	 */
	resolveKnownChain?: (chainId: string) => Promise<{ name: string } | null>;
	/** Chain-aware filter: which of the requested CAIP-25 scopes are supported. */
	resolveSupportedScope: (
		requested: ReturnType<typeof mergeRequestedScopes>,
	) => SupportedDappScope | Promise<SupportedDappScope>;
	/**
	 * Resolve (and materialize) the CAIP-10 account ids a session grants on a chain, so the connect
	 * result advertises them and a dapp doesn't need a follow-up read to learn its account. Optional.
	 */
	resolveConnectedAccountIds?: (
		chainId: string,
		accountGroupIds: readonly string[],
	) => Promise<string[]>;
	/** Persist an account-model mutation (wraps the unlocked key-manager update). */
	updateAccountModel: (
		update: (accountModel: AccountModelState) => AccountModelState,
	) => Promise<AccountModelState>;
	now?: () => number;
	/** Session lifetime; null (default) grants persistent sessions until revoked. */
	sessionTtlMs?: number | null;
};

export type DappAuthorization = {
	/** wallet_addChain: propose a new chain; gated behind a mandatory approval, id minted by wallet. */
	addChain: (input: { origin: string | null; params: unknown }) => Promise<{ chainId: string }>;
	createSession: (input: {
		origin: string | null;
		params: unknown;
	}) => Promise<Caip25CreateSessionResult>;
	getSession: (input: { origin: string | null }) => Caip25GetSessionResult;
	invokeMethod: (input: { origin: string | null; params: unknown }) => Promise<unknown>;
	revokeSession: (input: { origin: string | null }) => Promise<Caip25RevokeSessionResult>;
	/** wallet_switchChain: widen THIS connection's granted chain scope (per-connection, gated). */
	switchChain: (input: { origin: string | null; params: unknown }) => Promise<{ chainId: string }>;
};

export function createDappAuthorization(
	dependencies: DappAuthorizationDependencies,
): DappAuthorization {
	const {
		confirm,
		dispatch,
		getAccountModel,
		prepareChainAddition,
		registry,
		resolveConnectedAccountIds,
		resolveKnownChain,
		resolveSupportedScope,
		updateAccountModel,
		now = () => Date.now(),
		sessionTtlMs = null,
	} = dependencies;

	const runCreateSession = async ({
		origin,
		params,
	}: {
		origin: string | null;
		params: unknown;
	}): Promise<Caip25CreateSessionResult> => {
		const requestingOrigin = requireOrigin(origin);

		const requested = mergeRequestedScopes(asCreateSessionParams(params));
		const supported = await resolveSupportedScope(requested);

		if (supported.chains.length === 0) {
			throw dappAuthorizationErrors.unsupportedScopes(
				"None of the requested chains are supported.",
				{ requested: Object.keys(requested) },
			);
		}

		// Don't require an unlocked vault up front: a locked wallet still opens the connect modal,
		// which unlocks first and then loads the accounts (the account list only lives in memory
		// while unlocked). When already unlocked we pass the accounts straight in.
		const initialModel = getAccountModel();
		// Pre-check the accounts the origin's existing session already grants, so a reconnect doesn't
		// silently drop them (they show as "Connected" in the modal alongside the current account).
		const connectedAccountGroupIds = initialModel
			? connectedAccountGroupIdsForOrigin(registry, initialModel, requestingOrigin)
			: [];
		const connectData: DappConnectConfirmationData = {
			accounts: initialModel
				? buildDappConnectAccounts(initialModel, registry, connectedAccountGroupIds)
				: [],
			chains: supported.chains,
			kind: DAPP_CONNECT_CONFIRMATION_KIND,
			methods: supported.methods,
			origin: requestingOrigin,
			requiresUnlock: initialModel === null,
		};

		const decision = await confirm<DappConnectConfirmationResult>({
			title: "Connect this dapp?",
			message: requestingOrigin,
			data: connectData,
		});

		if (!decision.approved) {
			throw dappAuthorizationErrors.userRejected("User rejected the connection request.");
		}

		// The modal unlocks the vault as part of approval, so the account model is available now.
		const accountModel = requireUnlocked(getAccountModel());
		const accountGroups = listConnectableAccountGroups(accountModel);
		const currentAccountGroupId = trySelectedAccountGroupId(registry, accountModel);

		const scope: DappSessionScope = {
			accountGroupIds: resolveGrantedAccountGroupIds(
				accountGroups,
				currentAccountGroupId,
				decision.result,
			),
			chainAccountIds: [],
			chains: supported.chains,
			events: supported.events,
			methods: resolveGrantedMethods(supported.methods, decision.result),
		};

		// Resolve (and materialize) the granted account ids per chain so the connect result advertises
		// them — the dapp then learns its account without a follow-up read (and its extra approval).
		// Sequential on purpose: materializing derives accounts and writes the key-manager state, so
		// running chains concurrently would race that write (and the shared LWK derivation) and could
		// drop a freshly-created account, leaving the active chain with no account.
		const accountsByChain: Record<string, string[]> = {};

		if (resolveConnectedAccountIds) {
			for (const chainId of supported.chains) {
				accountsByChain[chainId] = await resolveConnectedAccountIds(
					chainId,
					scope.accountGroupIds,
				).catch(() => []);
			}
		}

		const sessionScopes = toCaip25Scopes(scope, accountsByChain);

		const createdAt = now();
		const expiresAt =
			sessionTtlMs === null || sessionTtlMs === undefined ? undefined : createdAt + sessionTtlMs;

		await updateAccountModel((model) => {
			const cleared = revokeInjectedSessionsForOrigin(registry, model, requestingOrigin);

			return registry.grantDappSession({
				accountModel: cleared,
				createdAt,
				expiresAt,
				origin: requestingOrigin,
				scope,
				transport: INJECTED_TRANSPORT,
			}).accountModel;
		});

		return { sessionScopes };
	};

	const getSession = ({ origin }: { origin: string | null }): Caip25GetSessionResult => {
		const accountModel = origin ? getAccountModel() : null;
		const session =
			accountModel && origin
				? registry.findDappSession(accountModel, {
						now: now(),
						origin,
						transport: INJECTED_TRANSPORT,
					})
				: null;

		if (!session || !accountModel) return { sessionScopes: {} };

		// Advertise the session's authorized CAIP-10 accounts per chain (read from the already
		// materialized chain accounts) so wallet_getSession is CAIP-25 complete: AppKit's
		// restore-on-load reads accounts[0] from here, and dapps list them without a follow-up call.
		return {
			sessionScopes: toCaip25Scopes(
				session.scope,
				resolveSessionAccountsByChain(accountModel, session.scope),
			),
		};
	};

	const revokeSession = async ({
		origin,
	}: {
		origin: string | null;
	}): Promise<Caip25RevokeSessionResult> => {
		const accountModel = origin ? getAccountModel() : null;

		if (!origin || !accountModel) return { revoked: false };
		if (injectedSessionIdsForOrigin(accountModel, origin).length === 0) return { revoked: false };

		await updateAccountModel((model) => revokeInjectedSessionsForOrigin(registry, model, origin));

		// Session gone. On the global injected bus we can't safely raise a per-origin `disconnect`
		// (it would reach every dapp), so we signal a scope change — each dapp re-queries its own
		// origin-scoped session and the one that lost it derives its disconnect. WalletConnect, being
		// point-to-point, raises a real disconnect on its own transport.
		emitWalletEvent("wallet_sessionChanged");

		return { revoked: true };
	};

	const invokeMethod = async ({
		origin,
		params,
	}: {
		origin: string | null;
		params: unknown;
	}): Promise<unknown> => {
		const invocation = parseInvokeParams(params);
		const requestingOrigin = requireOrigin(origin);
		const accountModel = requireUnlocked(getAccountModel());

		const session = registry.findDappSession(accountModel, {
			now: now(),
			origin: requestingOrigin,
			transport: INJECTED_TRANSPORT,
		});

		if (!session) {
			throw dappAuthorizationErrors.unauthorized(
				'No active session. Call "wallet_createSession" first.',
			);
		}

		// Chain scope is a hard gate. The method surface is not: every method the session authorized
		// is callable, and the method wrapper asks the user for the ones without a standing
		// permission — so hand the map down instead of rejecting here.
		if (!session.scope.chains.includes(invocation.scope)) {
			throw dappAuthorizationErrors.unauthorized(
				`Scope "${invocation.scope}" is not authorized for this session.`,
			);
		}

		return dispatch({
			accountGroupIds: session.scope.accountGroupIds,
			chainId: invocation.scope,
			grantedMethods: session.scope.methods,
			method: invocation.request.method,
			params: invocation.request.params,
		});
	};

	// Dedup concurrent createSession from the same origin: a dapp (or a duplicating/flaky transport)
	// can deliver wallet_createSession several times before the first resolves. Opening a confirmation
	// per copy makes each new one supersede (reject) the previous, so the dapp receives one of those
	// rejects even though a later copy is approved. Sharing the single in-flight promise collapses every
	// copy onto one approval, so they all resolve with the same result.
	const inFlightCreateSessions = new Map<string, Promise<Caip25CreateSessionResult>>();

	const createSession = async (input: {
		origin: string | null;
		params: unknown;
	}): Promise<Caip25CreateSessionResult> => {
		const requestingOrigin = requireOrigin(input.origin);
		const existing = inFlightCreateSessions.get(requestingOrigin);

		if (existing) return existing;

		const pending = runCreateSession(input).finally(() => {
			inFlightCreateSessions.delete(requestingOrigin);
		});

		inFlightCreateSessions.set(requestingOrigin, pending);

		return pending;
	};

	// wallet_addChain (EIP-3085-style): a dapp MAY propose a new chain, but only behind a mandatory
	// user approval, and the wallet mints its OWN id (never the dapp's — a dapp-supplied id could
	// collide with / spoof a built-in genesis hash). Adding is a SEPARATE consent from authorizing:
	// it persists the chain (making it switch-able) but does NOT widen this caller's session scope.
	const addChain = async ({
		origin,
		params,
	}: {
		origin: string | null;
		params: unknown;
	}): Promise<{ chainId: string }> => {
		const requestingOrigin = requireOrigin(origin);

		if (!prepareChainAddition) {
			throw dappAuthorizationErrors.invalidParams("Adding chains is not supported.");
		}

		// Validate the proposal up front (reject garbage before prompting). The wallet's own id is
		// minted later, inside `commit`, so a rejected request never persists anything.
		let prepared: PreparedChainAddition;

		try {
			prepared = prepareChainAddition(params);
		} catch (error) {
			if (error instanceof DappAuthorizationError) throw error;

			throw dappAuthorizationErrors.invalidParams(
				error instanceof Error ? error.message : "Invalid wallet_addChain parameters.",
			);
		}

		const data: DappAddChainConfirmationData = {
			backendUrl: prepared.backendUrl,
			kind: DAPP_ADD_CHAIN_CONFIRMATION_KIND,
			name: prepared.name,
			network: prepared.network,
			origin: requestingOrigin,
		};

		const decision = await confirm({ title: "Add this network?", message: requestingOrigin, data });

		if (!decision.approved) {
			throw dappAuthorizationErrors.userRejected("User rejected the add-chain request.");
		}

		// Only now (on approval) mint the id, re-check for a duplicate, and persist. Returns the minted
		// id so the dapp can follow up with wallet_switchChain to have this connection granted it.
		return { chainId: await prepared.commit() };
	};

	// wallet_switchChain: a PER-CONNECTION scope expansion (no global wallet-wide effect). Injected
	// has no per-connection "active" chain — the dapp passes its target chain as `scope` on every
	// wallet_invokeMethod — so this only ensures the chain is in THIS origin's granted scope.
	const switchChain = async ({
		origin,
		params,
	}: {
		origin: string | null;
		params: unknown;
	}): Promise<{ chainId: string }> => {
		const requestingOrigin = requireOrigin(origin);
		const chainId = parseSwitchChainParams(params);
		const accountModel = requireUnlocked(getAccountModel());

		const session = registry.findDappSession(accountModel, {
			now: now(),
			origin: requestingOrigin,
			transport: INJECTED_TRANSPORT,
		});

		if (!session) {
			throw dappAuthorizationErrors.unauthorized(
				'No active session. Call "wallet_createSession" first.',
			);
		}

		// Already granted to this connection → no-op success (just confirms it's authorized).
		if (session.scope.chains.includes(chainId)) {
			return { chainId };
		}

		// Unknown to the wallet → the dapp must add it first (EVM signals this exact case with 4902).
		const known = resolveKnownChain ? await resolveKnownChain(chainId) : null;

		if (!known) {
			throw dappAuthorizationErrors.unrecognizedChain(
				`Chain "${chainId}" is not recognized. Call "wallet_addChain" first.`,
				{ chainId },
			);
		}

		// Known but not yet in THIS origin's session → widening the scope exposes the connected account
		// on another chain, so require the same consent the connect grant does.
		const decision = await confirm({
			title: "Use this network?",
			message: requestingOrigin,
			data: {
				chainId,
				chainName: known.name,
				kind: DAPP_SWITCH_CHAIN_CONFIRMATION_KIND,
				origin: requestingOrigin,
			} satisfies DappSwitchChainConfirmationData,
		});

		if (!decision.approved) {
			throw dappAuthorizationErrors.userRejected("User rejected the switch-chain request.");
		}

		// Materialize the account(s) on the newly-granted chain (derives + persists the chain accounts)
		// so wallet_getSession advertises them and wallet_invokeMethod can dispatch — mirrors connect.
		if (resolveConnectedAccountIds) {
			await resolveConnectedAccountIds(chainId, session.scope.accountGroupIds).catch(() => []);
		}

		// Add the chain to THIS session's granted scope and persist. Re-read the session inside the
		// updater so a concurrent revoke (during the approval prompt) is never clobbered.
		await updateAccountModel((model) => {
			const current = model.dappSessions[session.id];

			if (!current) return model;

			return {
				...model,
				dappSessions: {
					...model.dappSessions,
					[session.id]: {
						...current,
						scope: {
							...current.scope,
							chains: [...new Set([...current.scope.chains, chainId])],
						},
						updatedAt: now(),
					},
				},
				updatedAt: now(),
			};
		});

		// Signal the scope change so the dapp re-queries its (now wider) session — mirrors revokeSession.
		emitWalletEvent("wallet_sessionChanged");

		return { chainId };
	};

	return { addChain, createSession, getSession, invokeMethod, revokeSession, switchChain };
}

function parseSwitchChainParams(params: unknown): string {
	if (!isRecord(params) || typeof params.chainId !== "string" || params.chainId.length === 0) {
		throw dappAuthorizationErrors.invalidParams("wallet_switchChain requires a chainId string.");
	}

	return params.chainId;
}

function resolveGrantedMethods(
	supportedMethods: string[],
	result: DappConnectConfirmationResult | undefined,
): Record<string, boolean> {
	const selected = result?.grantedMethods;

	// Every supported method is authorized and always callable — the selection only decides which of
	// them run without a per-call confirmation. Keying off `supportedMethods` also means a client can
	// never widen its own grant. No selection (a confirmation that only returns approve/reject) →
	// every method confirms.
	return Object.fromEntries(
		supportedMethods.map((method) => [method, selected?.includes(method) ?? false]),
	);
}

function requireOrigin(origin: string | null): string {
	if (!origin) {
		throw dappAuthorizationErrors.unauthorized("Could not determine the requesting dapp origin.");
	}

	return origin;
}

function requireUnlocked(accountModel: AccountModelState | null): AccountModelState {
	if (!accountModel) {
		throw dappAuthorizationErrors.walletLocked("Unlock the wallet to continue.");
	}

	return accountModel;
}

/**
 * The authorized CAIP-10 account ids per chain for a stored session, read from the account model's
 * already-materialized chain accounts (created at connect). Ordered by the session's `accountGroupIds`
 * so it matches what `wallet_createSession` advertised. A read, not a derivation — cheap enough for the
 * dapp's getSession polling.
 */
function resolveSessionAccountsByChain(
	accountModel: AccountModelState,
	scope: DappSessionScope,
): Record<string, string[]> {
	const accountsByChain: Record<string, string[]> = {};

	for (const chainId of scope.chains) {
		const accountIds: string[] = [];

		for (const accountGroupId of scope.accountGroupIds) {
			const chainAccount = Object.values(accountModel.chainAccounts).find(
				(candidate) => candidate.chainId === chainId && candidate.accountGroupId === accountGroupId,
			);

			if (chainAccount) accountIds.push(chainAccount.accountIdentifier);
		}

		accountsByChain[chainId] = accountIds;
	}

	return accountsByChain;
}

function asCreateSessionParams(params: unknown): Caip25CreateSessionParams {
	return isRecord(params) ? (params as Caip25CreateSessionParams) : {};
}

function parseInvokeParams(params: unknown): Caip27InvokeMethodParams {
	if (!isRecord(params)) {
		throw dappAuthorizationErrors.invalidParams("wallet_invokeMethod params must be an object.");
	}

	const scope = params.scope;
	const request = params.request;

	if (typeof scope !== "string" || scope.length === 0) {
		throw dappAuthorizationErrors.invalidParams("wallet_invokeMethod requires a scope string.");
	}

	if (!isRecord(request) || typeof request.method !== "string") {
		throw dappAuthorizationErrors.invalidParams("wallet_invokeMethod requires request.method.");
	}

	return {
		request: { method: request.method, params: request.params },
		scope,
		sessionId: typeof params.sessionId === "string" ? params.sessionId : undefined,
	};
}

function resolveGrantedAccountGroupIds(
	accountGroups: AccountGroupRecord[],
	currentAccountGroupId: AccountGroupId | undefined,
	result: DappConnectConfirmationResult | undefined,
): AccountGroupId[] {
	const selected = result?.grantedAccountGroupIds;

	// No structured result (e.g. an older popup) → default to the current account only. When the
	// connect modal returns a selection, grant only the chosen groups (∩ what exists).
	if (!selected) {
		return currentAccountGroupId ? [currentAccountGroupId] : [];
	}

	const selectedSet = new Set(selected);

	return accountGroups.map((group) => group.id).filter((id) => selectedSet.has(id));
}

function injectedSessionIdsForOrigin(accountModel: AccountModelState, origin: string) {
	return Object.values(accountModel.dappSessions)
		.filter((session) => session.transport === INJECTED_TRANSPORT && session.origin === origin)
		.map((session) => session.id);
}

function revokeInjectedSessionsForOrigin(
	registry: AccountRegistry,
	accountModel: AccountModelState,
	origin: string,
): AccountModelState {
	return injectedSessionIdsForOrigin(accountModel, origin).reduce(
		(model, sessionId) =>
			registry.revokeDappSession({ accountModel: model, sessionId }).accountModel,
		accountModel,
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
