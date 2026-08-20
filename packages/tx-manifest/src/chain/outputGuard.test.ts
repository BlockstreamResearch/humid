import { describe, expect, test } from "bun:test";

import { guardBlindedOutputs } from "./outputGuard";
import { txOutsOf } from "./txOut";

/**
 * The guard reads bytes, so the cases are built as bytes.
 *
 * Each one is a real Elements transaction with one input and the outputs the case needs, and
 * every output is written the way the chain writes one: an explicit amount is a `01` prefix and
 * eight bytes, a hidden one is a commitment prefix and thirty-two. A fixture assembled as an
 * object shaped like an answer would let this file assert something the parser could never see.
 */
const ASSET = `01${"aa".repeat(32)}`;
const HIDDEN_ASSET = `0a${"33".repeat(32)}`;
const HIDDEN_VALUE = `08${"44".repeat(32)}`;
const NONCE = `02${"55".repeat(32)}`;
const WALLET_SCRIPT = `0014${"11".repeat(20)}`;
/** One input spending an ordinary outpoint: count, txid, index, empty script, sequence. */
const ONE_INPUT = `01${"bb".repeat(32)}0000000000ffffffff`;

function explicit(sats: bigint, scriptHex: string): string {
	const value = `01${sats.toString(16).padStart(16, "0")}`;
	const length = (scriptHex.length / 2).toString(16).padStart(2, "0");

	return `${ASSET}${value}00${length}${scriptHex}`;
}

function hidden(scriptHex: string): string {
	const length = (scriptHex.length / 2).toString(16).padStart(2, "0");

	return `${HIDDEN_ASSET}${HIDDEN_VALUE}${NONCE}${length}${scriptHex}`;
}

/** The fee: no script at all, which is how the network reads the amount it charges. */
const FEE = explicit(500n, "");

function transaction(outputs: string[]): string {
	const count = outputs.length.toString(16).padStart(2, "0");

	return `02000000${"00"}${ONE_INPUT}${count}${outputs.join("")}00000000`;
}

describe("the bytes these cases are built from", () => {
	// The fixtures come first: a guard asserted against outputs the parser reads differently
	// than intended would pass while proving nothing.
	test("read back as the blinding each one was written with", () => {
		const found = txOutsOf(
			transaction([explicit(1000n, WALLET_SCRIPT), hidden(WALLET_SCRIPT), FEE]),
		);

		expect(found.ok).toBe(true);

		if (found.ok) {
			expect(found.txOuts.map((txOut) => txOut.amountSats)).toEqual(["1000", undefined, "500"]);
			expect(found.txOuts[2]?.scriptPubKeyHex).toBe("");
		}
	});
});

describe("a transaction that hides what the wallet decided to hide", () => {
	test("passes when every output came back the way it was built", () => {
		const built = transaction([hidden(WALLET_SCRIPT), explicit(2000n, WALLET_SCRIPT), FEE]);

		expect(
			guardBlindedOutputs(built, {
				changeBlinded: false,
				outputs: [
					{ blinded: true, id: "principal_claimed" },
					{ blinded: false, id: "vault_out" },
				],
			}),
		).toEqual({ ok: true });
	});

	// The failure this whole guard exists for. The amount is on the chain and no later step
	// can take it back, so the transaction is refused rather than returned.
	test("refuses when an output the protocol hides came back published", () => {
		const built = transaction([explicit(1000n, WALLET_SCRIPT), FEE]);
		const result = guardBlindedOutputs(built, {
			changeBlinded: false,
			outputs: [{ blinded: true, id: "principal_claimed" }],
		});

		expect(result.ok).toBe(false);
		expect(result.ok ? "" : result.reason).toBe(
			"The signed transaction publishes the amount on principal_claimed, which this action " +
				"hides. Nothing is returned.",
		);
	});

	// The opposite failure, and the one that costs more later: a Simplicity program reads
	// exact amounts through jets that cannot introspect a commitment, so a covenant output
	// built hidden is one its own contract can never spend.
	test("refuses when an output the protocol leaves open came back hidden", () => {
		const built = transaction([hidden(WALLET_SCRIPT), FEE]);
		const result = guardBlindedOutputs(built, {
			changeBlinded: false,
			outputs: [{ blinded: false, id: "vault_out" }],
		});

		expect(result.ok).toBe(false);
		expect(result.ok ? "" : result.reason).toBe(
			"The signed transaction hides the amount on vault_out, which this action leaves in " +
				"the open. Nothing is returned.",
		);
	});

	test("names the output that disagreed rather than the first one it looked at", () => {
		const built = transaction([hidden(WALLET_SCRIPT), explicit(2000n, WALLET_SCRIPT), FEE]);
		const result = guardBlindedOutputs(built, {
			changeBlinded: false,
			outputs: [
				{ blinded: true, id: "principal_claimed" },
				{ blinded: true, id: "collateral_claimed" },
			],
		});

		expect(result.ok ? "" : result.reason).toContain("collateral_claimed");
	});
});

describe("the change the module appends for itself", () => {
	// Change is not among the outputs the wallet adds — the module works out what is left
	// after the fee and appends it — so it is checked by where it lands rather than by name.
	test("is checked against what the wallet decided for it", () => {
		const built = transaction([explicit(1000n, WALLET_SCRIPT), hidden(WALLET_SCRIPT), FEE]);

		expect(
			guardBlindedOutputs(built, {
				changeBlinded: true,
				outputs: [{ blinded: false, id: "vault_out" }],
			}),
		).toEqual({ ok: true });
	});

	test("refuses when it came back published and nothing said to publish it", () => {
		const built = transaction([explicit(1000n, WALLET_SCRIPT), explicit(400n, WALLET_SCRIPT), FEE]);
		const result = guardBlindedOutputs(built, {
			changeBlinded: true,
			outputs: [{ blinded: false, id: "vault_out" }],
		});

		expect(result.ok).toBe(false);
		expect(result.ok ? "" : result.reason).toContain("the change");
	});

	// A transaction short enough that the module drops the change and pays what is left as
	// fee. There is nothing to check and nothing to refuse.
	test("is not looked for when the transaction carries none", () => {
		const built = transaction([explicit(1000n, WALLET_SCRIPT), FEE]);

		expect(
			guardBlindedOutputs(built, {
				changeBlinded: true,
				outputs: [{ blinded: false, id: "vault_out" }],
			}),
		).toEqual({ ok: true });
	});
});

describe("what the guard will not let through", () => {
	test("a fee whose amount is hidden, which no network can read", () => {
		const built = transaction([explicit(1000n, WALLET_SCRIPT), hidden("")]);
		const result = guardBlindedOutputs(built, {
			changeBlinded: false,
			outputs: [{ blinded: false, id: "vault_out" }],
		});

		expect(result.ok).toBe(false);
		expect(result.ok ? "" : result.reason).toContain("hides the fee");
	});

	// Fewer outputs than the wallet built is a difference like any other: a transaction
	// missing an output is not a safer version of the one a person approved.
	test("a transaction carrying fewer outputs than the action built", () => {
		const built = transaction([explicit(1000n, WALLET_SCRIPT)]);
		const result = guardBlindedOutputs(built, {
			changeBlinded: false,
			outputs: [
				{ blinded: false, id: "vault_out" },
				{ blinded: true, id: "principal_claimed" },
			],
		});

		expect(result.ok).toBe(false);
		expect(result.ok ? "" : result.reason).toContain("carries 1 outputs and this action built 2");
	});

	test("bytes that are not a transaction", () => {
		expect(guardBlindedOutputs("not hex", { changeBlinded: false, outputs: [] }).ok).toBe(false);
	});

	// An action that declares no outputs never reaches here, so this is about the guard
	// rather than about a document: with nothing expected, every output is change.
	test("an empty expectation still checks the fee and the change", () => {
		expect(
			guardBlindedOutputs(transaction([hidden(WALLET_SCRIPT), FEE]), {
				changeBlinded: true,
				outputs: [],
			}),
		).toEqual({ ok: true });
	});
});
