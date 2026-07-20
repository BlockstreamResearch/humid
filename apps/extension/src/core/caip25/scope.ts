import type { DappSessionScope } from "@/core/accounts/application/account-registry/model/dapp-session";

import type {
	Caip25CreateSessionParams,
	Caip25ScopedProperties,
	Caip25ScopeObject,
	Caip25Scopes,
} from "./types";

/**
 * HUMID-specific `scopedProperties` key. Maps each authorized method to whether it runs without a
 * confirmation (`true`) or prompts the user on every call (`false`). Standard CAIP-25 has no field
 * for this, so it rides the sanctioned per-scope property bag under a namespaced key. A dapp reads
 * it to auto-call only the silent methods and avoid a confirmation storm on load.
 */
export const HUMID_METHOD_POLICY_PROPERTY = "humid_methodPolicy";

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

/**
 * Project the stored method policy onto CAIP-25 `scopedProperties`, one entry per authorized chain
 * (mirroring {@link toCaip25Scopes}), each carrying {@link HUMID_METHOD_POLICY_PROPERTY}: the full
 * method→silent map. Lets a dapp distinguish "call freely" from "will prompt" without a probe call.
 */
export function toCaip25ScopedProperties(scope: DappSessionScope): Caip25ScopedProperties {
	const scopedProperties: Caip25ScopedProperties = {};

	for (const scopeString of scope.chains) {
		scopedProperties[scopeString] = {
			[HUMID_METHOD_POLICY_PROPERTY]: { ...scope.methods },
		};
	}

	return scopedProperties;
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
