// oxlint-disable no-useless-concat -- these fixtures are transaction bytes, and the joins are where one field ends and the next begins; one literal would hide the only thing that makes them readable
import { describe, expect, test } from "bun:test";

import { guardSpentInputs } from "./inputGuard";
import { spentInputs } from "./spentInputs";

// AC-11. The expected set is known before the signing module runs — the covenant inputs the
// action requires and the wallet outputs the wallet chose — so what is checked is the bytes
// that would reach the network, not the module's own account of what it did.

const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);

/** An Elements transaction serialised as far as its inputs, which is all this reads. */
function transaction(...spends: { issuance?: boolean; txid: string; vout: number }[]): string {
	const header = "02000000" + "01";
	const count = spends.length.toString(16).padStart(2, "0");
	const inputs = spends
		.map(({ issuance, txid, vout }) => {
			const reversed = (txid.match(/../g) ?? []).toReversed().join("");
			const marked = issuance ? vout | 0x80_00_00_00 : vout;
			const index = (marked >>> 0)
				.toString(16)
				.padStart(8, "0")
				.match(/../g)!
				.toReversed()
				.join("");

			return `${reversed}${index}00ffffffff`;
		})
		.join("");

	return `${header}${count}${inputs}`;
}

describe("spentInputs", () => {
	test("reads one outpoint out of the bytes", () => {
		expect(spentInputs(transaction({ txid: A, vout: 1 }))).toEqual({
			ok: true,
			spent: [{ txid: A, vout: 1 }],
		});
	});

	test("reads several, in order", () => {
		const result = spentInputs(transaction({ txid: A, vout: 0 }, { txid: B, vout: 7 }));

		expect(result.ok && result.spent).toEqual([
			{ txid: A, vout: 0 },
			{ txid: B, vout: 7 },
		]);
	});

	// Elements marks issuance in the top bits of the index rather than in a field of its own,
	// so an index read without unmasking is a number no outpoint has.
	test("unmasks the issuance flag out of the index", () => {
		const result = spentInputs(transaction({ issuance: true, txid: A, vout: 2 }));

		expect(result.ok && result.spent).toEqual([{ txid: A, vout: 2 }]);
	});

	test("refuses bytes that are not hex", () => {
		expect(spentInputs("zz").ok).toBe(false);
	});

	test("refuses a transaction that ends inside its inputs", () => {
		expect(spentInputs("0200000001" + "02" + "aa".repeat(10)).ok).toBe(false);
	});
});

describe("guardSpentInputs", () => {
	const covenant = { txid: A, vout: 0 };
	const wallet = { txid: B, vout: 1 };
	const expected = { covenantInputs: [covenant], walletInputs: [wallet] };

	test("passes when the transaction spends exactly what was expected", () => {
		expect(guardSpentInputs(transaction(covenant, wallet), expected)).toEqual({ ok: true });
	});

	test("passes whatever order they appear in", () => {
		expect(guardSpentInputs(transaction(wallet, covenant), expected)).toEqual({ ok: true });
	});

	test("refuses an input the action did not require and the wallet did not choose", () => {
		const result = guardSpentInputs(transaction(covenant, wallet, { txid: C, vout: 3 }), expected);

		expect(result.ok).toBe(false);
		expect(result.ok ? "" : result.reason).toContain(`${C}:3`);
	});

	// A transaction that spends less than the action requires is not a safer version of it.
	test("refuses one that leaves a required input out", () => {
		const result = guardSpentInputs(transaction(wallet), expected);

		expect(result.ok).toBe(false);
		expect(result.ok ? "" : result.reason).toContain(`${A}:0`);
	});

	test("refuses a transaction whose bytes it cannot read, rather than passing it", () => {
		expect(guardSpentInputs("not hex", expected).ok).toBe(false);
	});

	test("passes an action with no covenant inputs at all", () => {
		expect(
			guardSpentInputs(transaction(wallet), { covenantInputs: [], walletInputs: [wallet] }),
		).toEqual({ ok: true });
	});
});
