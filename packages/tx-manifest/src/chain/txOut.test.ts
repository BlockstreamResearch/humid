import { describe, expect, test } from "bun:test";

import transactions from "../__fixtures__/testnet-transactions.json";
import { txOutAt } from "./txOut";

/**
 * The fixtures are real Liquid testnet transactions, captured with both the bytes and what an
 * Esplora server says about them. The server's summary is the independent authority here: the
 * parser is right when it agrees with a component that did not come from this repository.
 *
 * Three shapes, because the field encoding differs and a parser that handles one lands
 * mid-output on the others: a coinbase whose outputs are explicit with zero value, a
 * transaction whose outputs hide their amounts, and an explicit taproot output — which is the
 * shape every covenant output has.
 */
type Fixture = {
	raw: string;
	txid: string;
	vout: { asset?: string; scriptpubkey: string; scriptpubkey_address?: string; value?: number }[];
};

const fixtures: Record<string, Fixture> = transactions;

describe("reading an output out of a transaction's own bytes", () => {
	for (const [name, fixture] of Object.entries(fixtures)) {
		test(`${name}: every output agrees with what the chain reports`, () => {
			for (const [index, expected] of fixture.vout.entries()) {
				const result = txOutAt(fixture.raw, index);

				expect(result.ok, `output ${index} of ${name}: ${!result.ok && result.reason}`).toBe(true);

				if (!result.ok) {
					return;
				}

				expect(result.txOut.scriptPubKeyHex).toBe(expected.scriptpubkey);

				if (expected.value === undefined) {
					// A confidential output commits to its amount and asset, so neither can be read.
					expect(result.txOut.amountSats).toBeUndefined();
					expect(result.txOut.rawAssetId).toBeUndefined();
				} else {
					expect(result.txOut.amountSats).toBe(String(expected.value));
					expect(result.txOut.rawAssetId).toBe(expected.asset);
				}
			}
		});

		test(`${name}: the serialised outputs are exactly the transaction's own bytes`, () => {
			// Concatenated, every output must reappear in the transaction unchanged and in order.
			// This is what the signing module is handed, so a re-encoding that merely looks right
			// is the failure to catch.
			let searchFrom = 0;

			for (const index of fixture.vout.keys()) {
				const result = txOutAt(fixture.raw, index);

				expect(result.ok).toBe(true);

				if (!result.ok) {
					return;
				}

				const at = fixture.raw.indexOf(result.txOut.txOutHex, searchFrom);

				expect(at, `output ${index} of ${name} is not in the transaction`).toBeGreaterThan(-1);
				searchFrom = at + result.txOut.txOutHex.length;
			}
		});
	}

	test("an output past the end is a refusal, not an empty answer", () => {
		const fixture = fixtures.coinbase;
		const result = txOutAt(fixture.raw, fixture.vout.length);

		expect(result).toEqual({
			ok: false,
			reason: `The transaction has no output at index ${fixture.vout.length}.`,
		});
	});

	test("bytes that are not a transaction refuse rather than parse to something", () => {
		expect(txOutAt("not hex", 0)).toEqual({ ok: false, reason: "The transaction is not hex." });
		expect(txOutAt("0200", 0).ok).toBe(false);
	});

	test("a negative or fractional index is refused", () => {
		expect(txOutAt(fixtures.coinbase.raw, -1)).toEqual({
			ok: false,
			reason: "Not an output index: -1",
		});
		expect(txOutAt(fixtures.coinbase.raw, 1.5)).toEqual({
			ok: false,
			reason: "Not an output index: 1.5",
		});
	});

	test("a taproot covenant output reads back as its script, its amount and its asset", () => {
		// The one shape that matters most: explicit, non-zero, and locked by a taproot script.
		const fixture = fixtures.explicitTaproot;
		const result = txOutAt(fixture.raw, 0);

		expect(result.ok).toBe(true);

		if (!result.ok) {
			return;
		}

		expect(result.txOut.scriptPubKeyHex.startsWith("5120")).toBe(true);
		expect(result.txOut.amountSats).toBe(String(fixture.vout[0].value));
		expect(result.txOut.rawAssetId).toBe(fixture.vout[0].asset);
		expect(result.txOut.txOutHex.endsWith(result.txOut.scriptPubKeyHex)).toBe(true);
	});
});
