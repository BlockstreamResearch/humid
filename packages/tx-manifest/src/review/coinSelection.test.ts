import { describe, expect, test } from "bun:test";

import { type SelectableUtxo, selectCoins } from "./coinSelection";
import { refusalOf } from "./reviewForTests";

function utxo(amount: string, overrides: Partial<SelectableUtxo> = {}): SelectableUtxo {
	return {
		amount,
		spendable: true,
		txOut: "00",
		txid: amount.padStart(64, "0"),
		vout: 0,
		...overrides,
	};
}

describe("selectCoins", () => {
	test("covers the target", () => {
		const result = selectCoins([utxo("30000"), utxo("40000")], 50_000n);

		expect(result.totalSats).toBe(70_000n);
	});

	test("takes the largest first and stops once covered", () => {
		const result = selectCoins([utxo("10000"), utxo("90000"), utxo("20000")], 50_000n);

		expect(result.selected).toHaveLength(1);
		expect(result.selected[0]?.amount).toBe("90000");
	});

	test("refuses when the account cannot cover the target", () => {
		expect(refusalOf(() => selectCoins([utxo("50000")], 50_001n)).reject).toBe("shortfall");
	});

	test("ignores what the wallet says it cannot spend", () => {
		expect(
			refusalOf(() => selectCoins([utxo("90000", { spendable: false })], 50_000n)).reject,
		).toBe("shortfall");
	});

	test("refuses to fund nothing", () => {
		expect(refusalOf(() => selectCoins([utxo("90000")], 0n)).reject).toBe("shortfall");
	});

	test("keeps amounts beyond a double's range exact", () => {
		const result = selectCoins([utxo("9007199254740993")], 9_007_199_254_740_993n);

		expect(result.totalSats).toBe(9_007_199_254_740_993n);
	});

	test("does not leave the selection short when the last output is exactly enough", () => {
		selectCoins([utxo("55000")], 55_000n);
	});

	test("keeps equal amounts in the order the wallet listed them", () => {
		const first = utxo("40000", { txid: `a${"0".repeat(63)}` });
		const second = utxo("40000", { txid: `b${"0".repeat(63)}` });
		const third = utxo("40000", { txid: `c${"0".repeat(63)}` });

		const result = selectCoins([first, second, third], 70_000n);

		expect(result.selected.map((selected) => selected.txid)).toEqual([first.txid, second.txid]);
	});

	test("still takes a larger output ahead of equal smaller ones", () => {
		const small = utxo("10000", { txid: `a${"0".repeat(63)}` });
		const big = utxo("90000", { txid: `b${"0".repeat(63)}` });
		const alsoSmall = utxo("10000", { txid: `c${"0".repeat(63)}` });

		const result = selectCoins([small, big, alsoSmall], 50_000n);

		expect(result.selected.map((selected) => selected.txid)).toEqual([big.txid]);
	});

	describe("what it will spend", () => {
		test("takes the largest output whether it is blinded or open", () => {
			const result = selectCoins(
				[
					{
						amount: "1000000",
						confidential: true,
						spendable: true,
						txOut: "00",
						txid: "a".repeat(64),
						vout: 0,
					},
					{ amount: "5000", spendable: true, txOut: "00", txid: "b".repeat(64), vout: 0 },
				],
				4000n,
			);

			expect(result.selected.map((chosen) => chosen.txid)).toEqual(["a".repeat(64)]);
		});

		test("and counts a blinded output towards what the account holds", () => {
			const result = selectCoins(
				[
					{
						amount: "1000000",
						confidential: true,
						spendable: true,
						txOut: "00",
						txid: "a".repeat(64),
						vout: 0,
					},
					{ amount: "500", spendable: true, txOut: "00", txid: "b".repeat(64), vout: 0 },
				],
				4000n,
			);

			expect(result.totalSats).toBe(1_000_000n);
		});

		test("and still refuses when everything it holds is short", () => {
			const result = refusalOf(() =>
				selectCoins(
					[{ amount: "500", spendable: true, txOut: "00", txid: "b".repeat(64), vout: 0 }],
					4000n,
				),
			);

			expect(result.reason).toContain("500");
		});

		test("takes an outpoint once, however many objects describe the outpoint", () => {
			const duplicated = {
				amount: "900",
				spendable: true,
				txOut: "00",
				txid: "a".repeat(64),
				vout: 0,
			};
			const result = selectCoins(
				[
					duplicated,
					{ ...duplicated },
					{ amount: "900", spendable: true, txOut: "00", txid: "b".repeat(64), vout: 0 },
				],
				1700n,
			);

			expect(result.selected.map((chosen) => chosen.txid)).toEqual([
				"a".repeat(64),
				"b".repeat(64),
			]);
		});
	});
});
