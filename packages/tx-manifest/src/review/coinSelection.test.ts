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

// The wallet receives to confidential addresses by default, so most of what it holds is
// blinded. A contract action cannot spend one: unblinding needs the secrets that go with
// it, and the signing module gets an outpoint and its bytes and nothing else. Selecting
// one builds a transaction that fails inside the module, far from the output that caused
// it — and largest-first would reach for the biggest, which is exactly the blinded one
// (DISC-139).
describe("confidential outputs", () => {
	const explicit = { amount: "1000", spendable: true, txOut: "00", txid: "a", vout: 0 };
	const blinded = {
		amount: "9000",
		confidential: true,
		spendable: true,
		txOut: "00",
		txid: "b",
		vout: 0,
	};

	test("are never selected, however much they hold", () => {
		const result = selectCoins([blinded, explicit], 500n, 0n);

		expect(result.ok && result.selected.map((utxo) => utxo.txid)).toEqual(["a"]);
	});

	test("and when they are why the account falls short, the refusal says so", () => {
		const result = selectCoins([blinded, explicit], 5000n, 0n);

		expect(result.ok ? "" : result.reason).toContain("9000");
		expect(result.ok ? "" : result.reason).toContain("unblinded address");
	});

	test("an account holding only blinded outputs is short of all of it", () => {
		const result = selectCoins([blinded], 100n, 0n);

		expect(result.ok).toBe(false);
	});

	test("nothing withheld leaves the refusal as it was", () => {
		const result = selectCoins([explicit], 5000n, 0n);

		expect(result.ok ? "" : result.reason).not.toContain("confidential");
	});
});
