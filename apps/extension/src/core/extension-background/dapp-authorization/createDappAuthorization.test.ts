import { describe, expect, test } from "bun:test";

import { AccountRegistry } from "@/core/accounts/application/account-registry/AccountRegistry";
import type { AccountModelState } from "@/core/accounts/application/account-registry/model/account-model";
import type { ConfirmationDecision } from "@/helpers/background";

import {
	createWalletUnlockRequester,
	isWalletUnlockConfirmationData,
} from "../confirmations/unlock";
import { createDappAuthorization } from "./createDappAuthorization";

const ORIGIN = "https://authorized.example";
const CHAIN = "liquid:testnet";

function fixture({
	locked = true,
	decision = { approved: true },
	revokeOnUnlock = false,
	remainLocked = false,
}: {
	locked?: boolean;
	decision?: ConfirmationDecision;
	revokeOnUnlock?: boolean;
	remainLocked?: boolean;
} = {}) {
	const registry = new AccountRegistry();
	const initial = registry.createLocalRootAccountModel({ createdAt: 100 }).accountModel;
	const granted = registry.grantDappSession({
		accountModel: initial,
		createdAt: 100,
		origin: ORIGIN,
		scope: {
			accountGroupIds: Object.values(initial.accountGroups).map((group) => group.id),
			chainAccountIds: [],
			chains: [CHAIN],
			events: [],
			methods: { getBalance: true },
		},
		transport: "injected",
	}).accountModel;
	let model: AccountModelState | null = locked ? null : granted;
	let dispatches = 0;
	let unlockPrompts = 0;
	const requestUnlock = createWalletUnlockRequester({
		confirm: async (request) => {
			if (!isWalletUnlockConfirmationData(request.data)) throw new Error("Expected unlock UI");
			unlockPrompts += 1;
			if (decision.approved && !remainLocked) {
				model = revokeOnUnlock ? { ...granted, dappSessions: {} } : granted;
			}
			return decision;
		},
		isUnlocked: () => model !== null,
	});
	const authorization = createDappAuthorization({
		confirm: async () => ({ approved: false }),
		dispatch: async () => {
			dispatches += 1;
			return { balance: "42" };
		},
		getAccountModel: () => model,
		requestUnlock,
		registry,
		resolveSupportedScope: () => ({ chains: [CHAIN], events: [], methods: ["getBalance"] }),
		updateAccountModel: async (update) => {
			if (!model) throw new Error("Unexpected locked model update");
			model = update(model);
			return model;
		},
		now: () => 200,
	});
	const invoke = (origin = ORIGIN, scope = CHAIN, method = "getBalance") =>
		authorization.invokeMethod({ origin, params: { scope, request: { method } } });
	return {
		authorization,
		invoke,
		counts: () => ({ dispatches, unlockPrompts }),
		lock: () => {
			model = null;
		},
	};
}

describe("locked dapp requests", () => {
	test("unlocks and resumes a previously authorized request exactly once", async () => {
		const wallet = fixture();
		expect(await wallet.invoke()).toEqual({ balance: "42" });
		expect(wallet.counts()).toEqual({ dispatches: 1, unlockPrompts: 1 });
	});

	test("a later lock transition opens the unlock UI for the next request", async () => {
		const wallet = fixture({ locked: false });
		await wallet.invoke();
		wallet.lock();
		await wallet.invoke();
		expect(wallet.counts()).toEqual({ dispatches: 2, unlockPrompts: 1 });
	});

	test("unlocking cannot authorize an unrelated origin", async () => {
		const wallet = fixture();
		await expect(wallet.invoke("https://untrusted.example")).rejects.toMatchObject({ code: 4100 });
		expect(wallet.counts().dispatches).toBe(0);
	});

	test("checks chain and method grants after unlock", async () => {
		const wrongChain = fixture();
		await expect(wrongChain.invoke(ORIGIN, "liquid:mainnet")).rejects.toMatchObject({ code: 4100 });
		expect(wrongChain.counts().dispatches).toBe(0);
		const wrongMethod = fixture();
		await expect(wrongMethod.invoke(ORIGIN, CHAIN, "signMessage")).rejects.toMatchObject({
			code: 4100,
		});
		expect(wrongMethod.counts().dispatches).toBe(0);
	});

	test("revalidates a session revoked while the unlock UI was open", async () => {
		const wallet = fixture({ revokeOnUnlock: true });
		await expect(wallet.invoke()).rejects.toMatchObject({ code: 4100 });
		expect(wallet.counts().dispatches).toBe(0);
	});

	test.each([
		{ approved: false },
		{ approved: false, reason: "closed" },
		{ approved: false, reason: "timeout" },
		{ approved: false, reason: "superseded" },
	] satisfies ConfirmationDecision[])(
		"preserves the unlock cancellation reason and prevents dispatch %j",
		async (decision) => {
			const wallet = fixture({ decision });
			await expect(wallet.invoke()).rejects.toMatchObject({
				code: 4001,
				data: { reason: decision.reason ?? "user_rejected" },
			});
			expect(wallet.counts().dispatches).toBe(0);
		},
	);

	test("an approval without a successful unlock reports locked, not a dispatch failure", async () => {
		const wallet = fixture({ remainLocked: true });
		await expect(wallet.invoke()).rejects.toMatchObject({ code: 4900 });
		expect(wallet.counts().dispatches).toBe(0);
	});

	test("reading the session while locked exposes no account or grant and does not prompt", () => {
		const wallet = fixture();
		expect(wallet.authorization.getSession({ origin: ORIGIN })).toEqual({ sessionScopes: {} });
		expect(wallet.counts()).toEqual({ dispatches: 0, unlockPrompts: 0 });
	});

	test("a locked network switch resumes against the existing connection", async () => {
		const wallet = fixture();
		expect(
			await wallet.authorization.switchChain({ origin: ORIGIN, params: { chainId: CHAIN } }),
		).toEqual({ chainId: CHAIN });
		expect(wallet.counts()).toEqual({ dispatches: 0, unlockPrompts: 1 });
	});
});
