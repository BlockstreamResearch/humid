import type { DappSessionScope } from "@/core/accounts/application/account-registry/model/dapp-session";

import type {
	Caip25CreateSessionParams,
	Caip25ScopeObject,
	Caip25Scopes,
	Caip25ScopeString,
} from "./types";

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
 */
export function toCaip25Scopes(
	scope: DappSessionScope,
	accountsByChain: Record<string, string[]> = {},
): Caip25Scopes {
	const scopes: Caip25Scopes = {};

	for (const scopeString of scope.chains) {
		scopes[scopeString] = {
			accounts: accountsByChain[scopeString] ?? [],
			methods: [...scope.methods],
			notifications: [...scope.events],
		};
	}

	return scopes;
}

/** Authorization check: is `method` permitted in `scopeString` by this session scope? */
export function isMethodAuthorized(
	scope: DappSessionScope,
	scopeString: Caip25ScopeString,
	method: string,
): boolean {
	return scope.chains.includes(scopeString) && scope.methods.includes(method);
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
