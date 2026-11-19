import { describe, expect, test } from "bun:test";

import { readWalletActivity } from "./readWalletData";

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

describe("activity for coins that are not blinded", () => {
	test("an explicit receive shows up", () => {
		const activity = readWalletActivity(
			wollet([
				walletTx("a", { inputs: [foreign], outputs: [owned(LBTC, 100_000n, true), foreign] }),
			]),
			LBTC,
		);

		expect(activity).toMatchObject([
			{ changes: [{ amountSats: "100000", rawAssetId: LBTC }], txid: "a" },
		]);
	});

	test("spending an explicit coin shows up as sent", () => {
		const activity = readWalletActivity(
			wollet([
				walletTx("b", { inputs: [owned(LBTC, 100_000n, true)], outputs: [foreign, foreign] }),
			]),
			LBTC,
		);

		expect(activity).toMatchObject([
			{ changes: [{ amountSats: "-100000", rawAssetId: LBTC }], txid: "b" },
		]);
	});

	test("explicit and confidential amounts add up in one transaction", () => {
		const activity = readWalletActivity(
			wollet([
				walletTx("c", {
					balance: [[LBTC, 5_000n]],
					outputs: [owned(LBTC, 5_000n, false), owned(LBTC, 2_000n, true)],
				}),
			]),
			LBTC,
		);

		expect(activity).toMatchObject([{ changes: [{ amountSats: "7000", rawAssetId: LBTC }] }]);
	});

	test("explicit coins of another asset are not counted", () => {
		const activity = readWalletActivity(
			wollet([walletTx("d", { outputs: [owned(TOKEN, 500n, true)] })]),
			LBTC,
		);

		expect(activity).toEqual([]);
	});
});

describe("activity across the account", () => {
	test("lists every asset a transaction changes", () => {
		const activity = readWalletActivity(
			wollet([
				walletTx("e", {
					balance: [
						[LBTC, -1_200n],
						[TOKEN, 21n],
					],
				}),
			]),
			null,
		);

		expect(activity).toMatchObject([
			{
				changes: [
					{ amountSats: "-1200", rawAssetId: LBTC },
					{ amountSats: "21", rawAssetId: TOKEN },
				],
				txid: "e",
			},
		]);
	});
});
