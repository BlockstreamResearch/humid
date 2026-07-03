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
import type { WalletCapabilityDescriptor } from "@/core/wallet-methods/capability";
import type { ConfirmationDecision, ConfirmationRequest } from "@/helpers/background";

import { emitWalletEvent } from "../wallet-events";
import {
	buildDappConnectAccounts,
	connectedAccountGroupIdsForOrigin,
	listConnectableAccountGroups,
	trySelectedAccountGroupId,
} from "./connectableAccounts";
import {
	DAPP_CONNECT_CONFIRMATION_KIND,
	type DappConnectConfirmationData,
	type DappConnectConfirmationResult,
} from "./connectConfirmation";
import { dappAuthorizationErrors } from "./errors";

const INJECTED_TRANSPORT = "injected" as const;

/** Chain-derived part of a granted scope (chains + methods + notifications). */
export type SupportedDappScope = {
	capabilities: WalletCapabilityDescriptor[];
	chains: string[];
	events: string[];
	methods: string[];
};

export type DappRequestDispatch = (request: {
	/** Account groups the session authorized; the chain binds execution to this set. */
	accountGroupIds: readonly string[];
	chainId: string;
	/** Methods the session granted; the method wrapper enforces them per-capability. */
	grantedMethods: readonly string[];
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
	registry: AccountRegistry;
	/** Chain-aware filter: which of the requested CAIP-25 scopes are supported. */
	resolveSupportedScope: (requested: ReturnType<typeof mergeRequestedScopes>) => SupportedDappScope;
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
	createSession: (input: {
		origin: string | null;
		params: unknown;
	}) => Promise<Caip25CreateSessionResult>;
	getSession: (input: { origin: string | null }) => Caip25GetSessionResult;
	invokeMethod: (input: { origin: string | null; params: unknown }) => Promise<unknown>;
	revokeSession: (input: { origin: string | null }) => Promise<Caip25RevokeSessionResult>;
};

export function createDappAuthorization(
	dependencies: DappAuthorizationDependencies,
): DappAuthorization {
	const {
		confirm,
		dispatch,
		getAccountModel,
		registry,
		resolveConnectedAccountIds,
		resolveSupportedScope,
		updateAccountModel,
		now = () => Date.now(),
		sessionTtlMs = null,
	} = dependencies;

	const createSession = async ({
		origin,
		params,
	}: {
		origin: string | null;
		params: unknown;
	}): Promise<Caip25CreateSessionResult> => {
		const requestingOrigin = requireOrigin(origin);

		const requested = mergeRequestedScopes(asCreateSessionParams(params));
		const supported = resolveSupportedScope(requested);

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
			capabilities: supported.capabilities,
			chains: supported.chains,
			kind: DAPP_CONNECT_CONFIRMATION_KIND,
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
		const accountsByChain: Record<string, string[]> = {};

		if (resolveConnectedAccountIds) {
			await Promise.all(
				supported.chains.map(async (chainId) => {
					accountsByChain[chainId] = await resolveConnectedAccountIds(
						chainId,
						scope.accountGroupIds,
					).catch(() => []);
				}),
			);
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

		return { sessionScopes: session ? toCaip25Scopes(session.scope) : {} };
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

		// Chain scope is a hard gate. Per-method grants are enforced inside the method
		// wrapper (ungranted read → RESTRICTED, ungranted action → error), so hand the
		// granted set down instead of rejecting every ungranted method here.
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

	return { createSession, getSession, invokeMethod, revokeSession };
}

function resolveGrantedMethods(
	supportedMethods: string[],
	result: DappConnectConfirmationResult | undefined,
): string[] {
	const selected = result?.grantedMethods;

	// No structured result (e.g. an older popup that only returns approve/reject) → grant all
	// supported. When the connect modal returns a selection, grant only the chosen subset,
	// intersected with what is supported so a client can never widen its own grant.
	if (!selected) return supportedMethods;

	return supportedMethods.filter((method) => selected.includes(method));
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
