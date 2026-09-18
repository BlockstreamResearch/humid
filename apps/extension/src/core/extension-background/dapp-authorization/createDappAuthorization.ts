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
	toCaip25ScopedProperties,
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

export const DEFAULT_INJECTED_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type SupportedDappScope = {
	chains: string[];
	events: string[];
	methods: string[];
};

export type PreparedChainAddition = {
	backendUrl: string;
	commit: () => Promise<string>;
	name: string;
	network: string;
};

export type DappRequestDispatch = (request: {
	accountGroupIds: readonly string[];
	chainId: string;
	grantedMethods: Record<string, boolean>;
	method: string;
	params: unknown;
}) => Promise<unknown>;

export type DappAuthorizationDependencies = {
	confirm: <TResult = unknown>(
		request: ConfirmationRequest,
	) => Promise<ConfirmationDecision<TResult>>;
	dispatch: DappRequestDispatch;
	getAccountModel: () => AccountModelState | null;
	prepareChainAddition?: (params: unknown) => PreparedChainAddition;
	registry: AccountRegistry;
	resolveKnownChain?: (chainId: string) => Promise<{ name: string } | null>;
	resolveSupportedScope: (
		requested: ReturnType<typeof mergeRequestedScopes>,
	) => SupportedDappScope | Promise<SupportedDappScope>;
	resolveConnectedAccountIds?: (
		chainId: string,
		accountGroupIds: readonly string[],
	) => Promise<string[]>;
	updateAccountModel: (
		update: (accountModel: AccountModelState) => AccountModelState,
	) => Promise<AccountModelState>;
	now?: () => number;
	sessionTtlMs?: number | null;
};

export type DappAuthorization = {
	addChain: (input: { origin: string | null; params: unknown }) => Promise<{ chainId: string }>;
	createSession: (input: {
		origin: string | null;
		params: unknown;
	}) => Promise<Caip25CreateSessionResult>;
	getSession: (input: { origin: string | null }) => Caip25GetSessionResult;
	invokeMethod: (input: { origin: string | null; params: unknown }) => Promise<unknown>;
	revokeSession: (input: { origin: string | null }) => Promise<Caip25RevokeSessionResult>;
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

		const initialModel = getAccountModel();
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
		const scopedProperties = toCaip25ScopedProperties(scope);

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

		return { scopedProperties, sessionScopes };
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

		return {
			scopedProperties: toCaip25ScopedProperties(session.scope),
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

		return { chainId: await prepared.commit() };
	};

	// wallet_switchChain: a PER-CONNECTION scope expansion (no global wallet-wide effect). Injected
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

		if (session.scope.chains.includes(chainId)) {
			return { chainId };
		}

		const known = resolveKnownChain ? await resolveKnownChain(chainId) : null;

		if (!known) {
			throw dappAuthorizationErrors.unrecognizedChain(
				`Chain "${chainId}" is not recognized. Call "wallet_addChain" first.`,
				{ chainId },
			);
		}

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

		if (resolveConnectedAccountIds) {
			await resolveConnectedAccountIds(chainId, session.scope.accountGroupIds).catch(() => []);
		}

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
