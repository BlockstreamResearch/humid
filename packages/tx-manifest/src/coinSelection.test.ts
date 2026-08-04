import { describe, expect, test } from "bun:test";

import { selectCoins, type SelectableUtxo } from "./coinSelection";

function utxo(amount: string, overrides: Partial<SelectableUtxo> = {}): SelectableUtxo {
	return {
		amount,
		spendable: true,
		txid: amount.padStart(64, "0"),
		txOut: "00",
		vout: 0,
		...overrides,
	};
}

describe("selectCoins", () => {
	test("covers the target plus the fee headroom", () => {
		const result = selectCoins([utxo("30000"), utxo("80000")], 50_000n, 5_000n);

		expect(result).toMatchObject({ ok: true });

		if (result.ok) {
			expect(result.totalSats).toBeGreaterThanOrEqual(55_000n);
		}
	});

	// Fewer inputs is a smaller transaction and therefore a smaller fee.
	test("takes the largest first and stops once covered", () => {
		const result = selectCoins([utxo("10000"), utxo("90000"), utxo("20000")], 50_000n, 0n);

		expect(result).toMatchObject({ ok: true });

		if (result.ok) {
			expect(result.selected).toHaveLength(1);
			expect(result.selected[0]?.amount).toBe("90000");
		}
	});

	test("refuses when the account cannot cover the fee, even if it covers the outputs", () => {
		const result = selectCoins([utxo("50000")], 50_000n, 5_000n);

		expect(result).toMatchObject({ ok: false });
	});

	test("ignores what the wallet says it cannot spend", () => {
		const result = selectCoins([utxo("90000", { spendable: false })], 50_000n, 0n);

		expect(result).toMatchObject({ ok: false });
	});

	test("refuses to fund nothing", () => {
		const result = selectCoins([utxo("90000")], 0n, 0n);

		expect(result).toMatchObject({ ok: false });
	});

	// Base units past a double's range have to stay exact, or a large balance rounds into a
	// wrong decision.
	test("keeps amounts beyond a double's range exact", () => {
		const result = selectCoins([utxo("9007199254740993")], 9_007_199_254_740_992n, 1n);

		expect(result).toMatchObject({ ok: true });

		if (result.ok) {
			expect(result.totalSats).toBe(9_007_199_254_740_993n);
		}
	});
});
