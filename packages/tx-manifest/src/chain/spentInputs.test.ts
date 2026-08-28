import { describe, expect, test } from "bun:test";

import { spentInputs } from "./spentInputs";

/**
 * Reading which outpoints a finished transaction spends.
 *
 * The reader walks the bytes rather than asking the module that built them, which is the whole
 * point of the guard it feeds. That makes the walk itself load-bearing: a field it does not know
 * about does not raise, it shifts everything after it, and the guard then refuses a transaction
 * for spending an outpoint nobody built.
 */

const TXID_A = "11".repeat(32);
const TXID_B = "22".repeat(32);

/** One input, with the issuance fields Elements writes after the sequence when it declares one. */
function input(txidHex: string, vout: number, issuance?: { explicitAmount: boolean }) {
	const flagged = issuance === undefined ? vout : vout | 0x8000_0000;
	const index = new Uint8Array(4);

	new DataView(index.buffer).setUint32(0, flagged >>> 0, true);

	const parts = [
		txidHex, // serialised reversed, and reversed back on the way out
		[...index].map((byte) => byte.toString(16).padStart(2, "0")).join(""),
		"00", // empty scriptSig
		"ffffffff", // sequence
	];

	if (issuance) {
		parts.push(
			"00".repeat(32), // asset blinding nonce
			"aa".repeat(32), // asset entropy
			issuance.explicitAmount ? `01${"00".repeat(7)}02` : "00", // amount: explicit, or absent
			"00", // inflation keys: absent
		);
	}

	return parts.join("");
}

function transaction(...inputs: string[]) {
	return ["02000000", "01", inputs.length.toString(16).padStart(2, "0"), ...inputs].join("");
}

describe("the outpoints a signed transaction spends", () => {
	test("reads an ordinary input", () => {
		const result = spentInputs(transaction(input(TXID_A, 3)));

		expect(result).toEqual({ ok: true, spent: [{ txid: TXID_A, vout: 3 }] });
	});

	/*
	 * An input that creates an asset carries four more fields, written after the sequence and
	 * announced by the top bit of the index. Walking past them as though they were the next
	 * input's outpoint is what made a two-input transaction read as spending all-zeroes — and the
	 * guard, correctly, refused a transaction the wallet had built itself.
	 */
	test("reads the input after one that creates an asset", () => {
		const result = spentInputs(
			transaction(input(TXID_A, 0, { explicitAmount: true }), input(TXID_B, 1)),
		);

		expect(result).toEqual({
			ok: true,
			spent: [
				{ txid: TXID_A, vout: 0 },
				{ txid: TXID_B, vout: 1 },
			],
		});
	});

	test("reads one whose issuance amounts are absent rather than explicit", () => {
		const result = spentInputs(
			transaction(input(TXID_A, 0, { explicitAmount: false }), input(TXID_B, 2)),
		);

		expect(result).toEqual({
			ok: true,
			spent: [
				{ txid: TXID_A, vout: 0 },
				{ txid: TXID_B, vout: 2 },
			],
		});
	});

	test("says so rather than guessing when the bytes end early", () => {
		const result = spentInputs(
			transaction(input(TXID_A, 0, { explicitAmount: true })).slice(0, 60),
		);

		expect(result.ok).toBe(false);
	});
});
