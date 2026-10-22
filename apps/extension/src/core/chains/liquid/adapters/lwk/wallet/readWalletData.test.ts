import { describe, expect, test } from "bun:test";

import { readWalletActivityForAsset } from "./readWalletData";

const LBTC = "aa".repeat(32);
const TOKEN = "cc".repeat(32);

const owned = (asset: string, value: bigint, explicit: boolean) => ({
	get: () => ({
		unblinded: () => ({
			asset: () => ({ toString: () => asset }),
			isExplicit: () => explicit,
			value: () => value,
		}),
	}),
});

const foreign = { get: () => undefined };

function walletTx(
	txid: string,
	{
		balance = [],
		inputs = [],
		outputs = [],
	}: { balance?: [string, bigint][]; inputs?: unknown[]; outputs?: unknown[] },
) {
	return {
		balance: () => ({ entries: () => new Map(balance) }),
		fee: () => 100n,
		inputs: () => inputs,
		outputs: () => outputs,
		timestamp: () => 1_700_000_000,
		txid: () => ({ toString: () => txid }),
	};
}

const wollet = (txs: unknown[]) => ({ transactions: () => txs }) as never;

describe("activity for coins that hide nothing", () => {
	test("an explicit receive shows up", () => {
		const activity = readWalletActivityForAsset(
			wollet([
				walletTx("a", { inputs: [foreign], outputs: [owned(LBTC, 100_000n, true), foreign] }),
			]),
			LBTC,
		);

		expect(activity).toMatchObject([{ amountSats: "100000", direction: "received", txid: "a" }]);
	});

	test("spending an explicit coin shows up as sent", () => {
		const activity = readWalletActivityForAsset(
			wollet([
				walletTx("b", { inputs: [owned(LBTC, 100_000n, true)], outputs: [foreign, foreign] }),
			]),
			LBTC,
		);

		expect(activity).toMatchObject([{ amountSats: "100000", direction: "sent", txid: "b" }]);
	});

	test("explicit and confidential amounts add up in one transaction", () => {
		const activity = readWalletActivityForAsset(
			wollet([
				walletTx("c", {
					balance: [[LBTC, 5_000n]],
					outputs: [owned(LBTC, 5_000n, false), owned(LBTC, 2_000n, true)],
				}),
			]),
			LBTC,
		);

		expect(activity).toMatchObject([{ amountSats: "7000", direction: "received" }]);
	});

	test("explicit coins of another asset are not counted", () => {
		const activity = readWalletActivityForAsset(
			wollet([walletTx("d", { outputs: [owned(TOKEN, 500n, true)] })]),
			LBTC,
		);

		expect(activity).toEqual([]);
	});
});
