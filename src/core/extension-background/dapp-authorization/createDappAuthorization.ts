import type { AccountRegistry } from "@/core/accounts/application/account-registry/AccountRegistry";
import type { AccountModelState } from "@/core/accounts/application/account-registry/model/account-model";
import type { DappSessionScope } from "@/core/accounts/application/account-registry/model/dapp-session";
import {
	type Caip25CreateSessionParams,
	type Caip25CreateSessionResult,
	type Caip25GetSessionResult,
	type Caip25RevokeSessionResult,
	type Caip27InvokeMethodParams,
	mergeRequestedScopes,
	toCaip25Scopes,
} from "@/core/caip25";
import type { ConfirmationRequest } from "@/helpers/background";

import { dappAuthorizationErrors } from "./errors";

const INJECTED_TRANSPORT = "injected" as const;

/** Chain-derived part of a granted scope (chains + methods + notifications). */
export type SupportedDappScope = {
	chains: string[];
	events: string[];
	methods: string[];
};

export type DappRequestDispatch = (request: {
	chainId: string;
	/** Methods the session granted; the method wrapper enforces them per-capability. */
	grantedMethods: readonly string[];
	method: string;
	params: unknown;
}) => Promise<unknown>;

export type DappAuthorizationDependencies = {
	confirm: (request: ConfirmationRequest) => Promise<boolean>;
	/** Executes an authorized chain request (chain resolution + context build). */
	dispatch: DappRequestDispatch;
	/** Current account model, or null when the vault is locked. */
	getAccountModel: () => AccountModelState | null;
	registry: AccountRegistry;
	/** Chain-aware filter: which of the requested CAIP-25 scopes are supported. */
	resolveSupportedScope: (requested: ReturnType<typeof mergeRequestedScopes>) => SupportedDappScope;
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
		const accountModel = requireUnlocked(getAccountModel());

		const requested = mergeRequestedScopes(asCreateSessionParams(params));
		const supported = resolveSupportedScope(requested);

		if (supported.chains.length === 0) {
			throw dappAuthorizationErrors.unsupportedScopes(
				"None of the requested chains are supported.",
				{ requested: Object.keys(requested) },
			);
		}

		const scope: DappSessionScope = {
			accountGroupIds: selectedAccountGroupIds(registry, accountModel),
			chainAccountIds: [],
			chains: supported.chains,
			events: supported.events,
			methods: supported.methods,
		};
		const sessionScopes = toCaip25Scopes(scope);

		const approved = await confirm({
			title: "Connect this dapp?",
			message: requestingOrigin,
			data: { origin: requestingOrigin, scopes: sessionScopes },
		});

		if (!approved) {
			throw dappAuthorizationErrors.userRejected("User rejected the connection request.");
		}

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
			chainId: invocation.scope,
			grantedMethods: session.scope.methods,
			method: invocation.request.method,
			params: invocation.request.params,
		});
	};

	return { createSession, getSession, invokeMethod, revokeSession };
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

function selectedAccountGroupIds(
	registry: AccountRegistry,
	accountModel: AccountModelState,
): DappSessionScope["accountGroupIds"] {
	try {
		return [registry.getSelectedAccountGroup(accountModel).id];
	} catch {
		return [];
	}
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
