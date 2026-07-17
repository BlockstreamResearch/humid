import type { DappSessionScope } from "@/core/accounts/application/account-registry/model/dapp-session";

import type { Caip25CreateSessionParams, Caip25ScopeObject, Caip25Scopes } from "./types";

/** Merge `requiredScopes` and `optionalScopes` into a single requested map. */
export function mergeRequestedScopes(params: Caip25CreateSessionParams): Caip25Scopes {
	const merged: Caip25Scopes = {};

	for (const source of [params.requiredScopes, params.optionalScopes]) {
		for (const [scopeString, scope] of Object.entries(source ?? {})) {
			const existing = merged[scopeString];

			merged[scopeString] = existing
				? {
						accounts: dedupe([...(existing.accounts ?? []), ...(scope.accounts ?? [])]),
						methods: dedupe([...existing.methods, ...scope.methods]),
						notifications: dedupe([...existing.notifications, ...scope.notifications]),
						references: dedupe([...(existing.references ?? []), ...(scope.references ?? [])]),
					}
				: normalizeScopeObject(scope);
		}
	}

	return merged;
}

/**
 * Present a stored flat session scope as per-chain CAIP-25 scope objects. `accountsByChain`
 * supplies the resolved CAIP-10 account ids per chain (empty when the caller can't resolve them).
 * `methods` advertises the session's whole authorized surface — every method it may call, not just
 * the pre-approved ones — so a dapp can feature-detect methods that confirm with the user.
 */
export function toCaip25Scopes(
	scope: DappSessionScope,
	accountsByChain: Record<string, string[]> = {},
): Caip25Scopes {
	const scopes: Caip25Scopes = {};
	const methods = Object.keys(scope.methods).toSorted();

	for (const scopeString of scope.chains) {
		scopes[scopeString] = {
			accounts: accountsByChain[scopeString] ?? [],
			methods: [...methods],
			notifications: [...scope.events],
		};
	}

	return scopes;
}

function normalizeScopeObject(scope: Caip25ScopeObject): Caip25ScopeObject {
	return {
		accounts: dedupe(scope.accounts ?? []),
		methods: dedupe(scope.methods),
		notifications: dedupe(scope.notifications),
		references: dedupe(scope.references ?? []),
	};
}

function dedupe<T>(values: T[]): T[] {
	return [...new Set(values)];
}
