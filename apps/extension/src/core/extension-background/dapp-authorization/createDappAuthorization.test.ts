import { expect, test } from "bun:test";

import { AccountRegistry } from "@/core/accounts/application/account-registry/AccountRegistry";

import { createDappAuthorization } from "./createDappAuthorization";

test("locked requests wait for unlock, then reject without approval or dispatch if it is dismissed", async () => {
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
				params: { scope: "liquid:testnet", request: { method: "getBalance" } },
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
});
