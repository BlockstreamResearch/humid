import { expect, test } from "bun:test";

import { AccountRegistry } from "@/core/accounts/application/account-registry/AccountRegistry";
import type { AccountModelState } from "@/core/accounts/application/account-registry/model/account-model";
import { HUMID_METHOD_POLICY_PROPERTY } from "@/core/caip25";

import { createDappAuthorization } from "./createDappAuthorization";

test("locked requests wait for unlock, then reject without approval or dispatch if it is dismissed, and locked reads reject without waiting", async () => {
	let confirmations = 0;
	let unlockWaits = 0;
	const authorization = createDappAuthorization({
		registry: new AccountRegistry(),
		getAccountModel: () => null,
		confirm: async () => {
			confirmations++;
			return { approved: true };
		},
		dispatch: async () => {
			throw new Error("Locked request must not dispatch");
		},
		resolveSupportedScope: () => ({
			chains: ["liquid:testnet"],
			events: [],
			methods: ["getBalance"],
		}),
		updateAccountModel: async () => {
			throw new Error("Locked request must not update accounts");
		},
		waitForUnlock: async () => {
			unlockWaits++;
		},
	});
	const origin = "https://example.org";
	const params = {
		requiredScopes: { "liquid:testnet": { methods: ["getBalance"], notifications: [] } },
	};
	const requests = [
		() =>
			authorization.invokeMethod({
				origin,
				params: { scope: "liquid:testnet", request: { method: "signMessage" } },
			}),
		() => authorization.createSession({ origin, params }),
		() => authorization.addChain({ origin, params: { chainId: "liquid:testnet" } }),
		() => authorization.switchChain({ origin, params: { chainId: "liquid:testnet" } }),
	];
	await Promise.all(
		requests.map((request) => expect(request()).rejects.toMatchObject({ code: 4900 })),
	);
	expect(confirmations).toBe(0);
	expect(unlockWaits).toBe(requests.length);
	expect(authorization.getSession({ origin })).toEqual({ sessionScopes: {} });

	await expect(
		authorization.invokeMethod({
			origin,
			params: { scope: "liquid:testnet", request: { method: "getBalance" } },
		}),
	).rejects.toMatchObject({ code: 4900 });
	expect(unlockWaits).toBe(requests.length);
});

test("an approval grants no-prompt use of reads only, and a stored grant to sign or spend is never honoured", async () => {
	const chain = "liquid:testnet";
	const methods = ["getBalance", "sendTransfer", "signPset"];
	const origin = "https://example.org";
	const registry = new AccountRegistry();
	let model = registry.createLocalRootAccountModel().accountModel;
	const dispatched: Record<string, boolean>[] = [];
	const authorization = createDappAuthorization({
		registry,
		getAccountModel: () => model,
		confirm: async <T>() => ({
			approved: true,
			result: {
				grantedAccountGroupIds: Object.keys(model.accountGroups),
				grantedMethods: methods,
			} as T,
		}),
		dispatch: async ({ grantedMethods }) => {
			dispatched.push(grantedMethods);

			return null;
		},
		resolveSupportedScope: () => ({ chains: [chain], events: [], methods }),
		updateAccountModel: async (update) => (model = update(model)),
		waitForUnlock: async () => {},
	});
	const readsOnly = { getBalance: true, sendTransfer: false, signPset: false };

	const session = await authorization.createSession({
		origin,
		params: { requiredScopes: { [chain]: { methods, notifications: [] } } },
	});

	expect(session.scopedProperties?.[chain]?.[HUMID_METHOD_POLICY_PROPERTY]).toEqual(readsOnly);

	model = grantingEverything(model);
	await authorization.invokeMethod({
		origin,
		params: { scope: chain, request: { method: "sendTransfer" } },
	});

	expect(dispatched).toEqual([readsOnly]);
});

function grantingEverything(model: AccountModelState): AccountModelState {
	return {
		...model,
		dappSessions: Object.fromEntries(
			Object.entries(model.dappSessions).map(([id, session]) => [
				id,
				{
					...session,
					scope: {
						...session.scope,
						methods: Object.fromEntries(Object.keys(session.scope.methods).map((m) => [m, true])),
					},
				},
			]),
		),
	};
}
