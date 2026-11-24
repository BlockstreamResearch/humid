import { describe, expect, spyOn, test } from "bun:test";

import { logger } from "@/core/logger";
import type { WalletRpcBaseContext } from "@/core/wallet-rpc/types";

import { createWalletMethod } from "./createWalletMethod";

const granted = { authorization: { isGranted: () => true } } as unknown as WalletRpcBaseContext;

function journaled(steps: string[], spends: boolean) {
	return createWalletMethod<string, WalletRpcBaseContext, string, string>({
		confirmation: () => ({ title: "" }),
		execute: async ({ params }) => {
			await Promise.resolve();
			steps.push(`execute ${params}`);

			return params;
		},
		id: "method",
		parse: (params) => String(params),
		review: ({ params }) => {
			steps.push(`review ${params}`);

			return params;
		},
		spends,
	});
}

describe("a spending request", () => {
	test("is reviewed only once the spending request before it is done", async () => {
		const steps: string[] = [];
		const method = journaled(steps, true);

		await Promise.all([method("first", granted), method("second", granted)]);

		expect(steps).toEqual(["review first", "execute first", "review second", "execute second"]);
	});

	test("waits on a request before it that failed", async () => {
		const steps: string[] = [];
		const failing = createWalletMethod<string, WalletRpcBaseContext, string, string>({
			confirmation: () => ({ title: "" }),
			execute: () => {
				throw new Error("refused");
			},
			id: "failing",
			parse: String,
			review: () => "",
			spends: true,
		});

		await Promise.all([
			expect(failing("first", granted)).rejects.toThrow("refused"),
			journaled(steps, true)("second", granted),
		]);

		expect(steps).toEqual(["review second", "execute second"]);
	});
});

describe("a request that spends nothing", () => {
	test("does not wait for another", async () => {
		const steps: string[] = [];
		const method = journaled(steps, false);

		await Promise.all([method("first", granted), method("second", granted)]);

		expect(steps).toEqual(["review first", "review second", "execute first", "execute second"]);
	});
});

test("a sent transaction is reported as sent even when its receipt cannot be built", async () => {
	const warned = spyOn(logger, "warn").mockImplementation(() => {});
	let shown: unknown;
	const sending = createWalletMethod<string, WalletRpcBaseContext, string, { txid: string }>({
		confirmation: () => ({ title: "" }),
		execute: async () => ({ txid: "ab".repeat(32) }),
		id: "send",
		parse: String,
		receipt: () => {
			throw new Error("The portfolio is unreadable.");
		},
		review: () => "",
	});
	const asking = {
		authorization: { isGranted: () => false },
		confirm: async (_request: unknown, complete: (choice: unknown) => Promise<unknown>) => {
			shown = await complete(undefined);

			return { approved: true };
		},
	} as unknown as WalletRpcBaseContext;

	expect(await sending("", asking)).toEqual({ txid: "ab".repeat(32) });
	expect(shown).toMatchObject({ changes: [], txid: "ab".repeat(32) });
	expect(warned).toHaveBeenCalledTimes(1);
	warned.mockRestore();
});
