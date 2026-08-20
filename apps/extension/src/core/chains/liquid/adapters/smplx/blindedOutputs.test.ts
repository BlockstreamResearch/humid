import { describe, expect, test } from "bun:test";

import { guardBlindedOutputs, txOutAt } from "@humid/tx-manifest";

import { smplx as bindings } from "./smplxWasmForTests";

/**
 * What a blinding key actually does to a transaction, established by building one.
 *
 * The wallet decides whether an output hides what it carries while it reads the document, and
 * the module that builds the transaction has never read it. All that crosses between them is a
 * blinding key or the absence of one, and the call says nothing about what became of it — so
 * until this file, the whole seam rested on a comment. Every other test that finalises a
 * transaction here builds every output in the open, which means the blinding path had never
 * run anywhere in this repository while the published protocols hide amounts in it.
 *
 * So both halves are measured here rather than assumed: that a key handed over produces a
 * commitment where the amount would be, and that the guard reading those bytes afterwards
 * tells the two apart. The second half is the one that matters when the first stops being
 * true, which is why the wrong build is exercised alongside the right one.
 */

// A BIP39 test vector, not a wallet mnemonic.
const TEST_MNEMONIC =
	"abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const TXID = "7".repeat(64);
// L-BTC on Liquid testnet, the policy asset the fee is paid in.
const POLICY_ASSET = "144c654344aa716d6f3abcc1ca90e5641e4e2a7f633bc09fe3baf64585819a49";
const FEE_RATE = 100;

/** An explicit output of `sats` of the policy asset — the only kind a contract action spends. */
function encodeTxOut(sats: bigint, scriptHex: string): string {
	const assetLe = (POLICY_ASSET.match(/../g) ?? []).toReversed().join("");
	const value = sats.toString(16).padStart(16, "0");
	const scriptLen = (scriptHex.length / 2).toString(16).padStart(2, "0");

	return `01${assetLe}01${value}00${scriptLen}${scriptHex}`;
}

/**
 * One transaction built exactly the way the method builds one, and signed.
 *
 * `paymentBlinded` and `changeBlinded` are what the wallet decided; passing them through as a
 * blinding key or as nothing is the same line the method runs.
 */
function build(paymentBlinded: boolean, changeBlinded: boolean): string {
	const signer = new bindings.WalletSigner(TEST_MNEMONIC, "liquid-testnet");
	const builder = new bindings.TransactionBuilder();

	try {
		const script = signer.scriptPubKeyHex();

		builder.addWalletInput(TXID, 0, encodeTxOut(100_000n, script));
		builder.addOutput(
			script,
			50_000n,
			POLICY_ASSET,
			paymentBlinded ? signer.blindingPublicKey() : undefined,
		);
		builder.addChange(script, changeBlinded ? signer.blindingPublicKey() : undefined);

		const signed = signer.finalizeTransaction(builder, FEE_RATE);
		const hex = signed.hex;

		signed.free();

		return hex;
	} finally {
		builder.free();
		signer.free();
	}
}

/** Whether the output at `vout` came back with an amount anyone can read. */
function published(transactionHex: string, vout: number): boolean {
	const found = txOutAt(transactionHex, vout);

	if (!found.ok) {
		throw new Error(found.reason);
	}

	return found.txOut.amountSats !== undefined;
}

describe("an output built with a blinding key", () => {
	test("comes back with its amount and its asset committed rather than written", () => {
		const built = build(true, true);

		expect(published(built, 0)).toBe(false);
		expect(published(built, 1)).toBe(false);
		// The fee is the one output the network has to read, and it stays in the open.
		expect(published(built, 2)).toBe(true);
	});

	// The same builder, the same inputs, one argument dropped. Nothing about the call fails
	// and the transaction is perfectly valid; the amount is simply on the chain.
	test("and comes back written when the key is not passed", () => {
		const built = build(false, false);

		expect(published(built, 0)).toBe(true);
		expect(published(built, 1)).toBe(true);
	});

	// Each output answers for itself. A transaction is not blinded or unblinded as a whole,
	// which is what makes a per-output decision meaningful at all.
	test("independently of what the other outputs did", () => {
		const built = build(true, false);

		expect(published(built, 0)).toBe(false);
		expect(published(built, 1)).toBe(true);
	});
});

describe("the guard against what was actually built", () => {
	const hides = { changeBlinded: true, outputs: [{ blinded: true, id: "principal_claimed" }] };

	test("passes a transaction that hides exactly what the wallet decided to hide", () => {
		expect(guardBlindedOutputs(build(true, true), hides)).toEqual({ ok: true });
	});

	// What a dropped decision looks like from the far side: the wallet decided to hide, the
	// transaction published, and nothing between the two said so.
	test("refuses the same transaction built without the key", () => {
		const result = guardBlindedOutputs(build(false, false), hides);

		expect(result.ok).toBe(false);
		expect(result.ok ? "" : result.reason).toContain("publishes the amount on principal_claimed");
	});

	test("refuses a hidden amount where the wallet decided on an open one", () => {
		const result = guardBlindedOutputs(build(true, true), {
			changeBlinded: false,
			outputs: [{ blinded: false, id: "vault_out" }],
		});

		expect(result.ok).toBe(false);
		expect(result.ok ? "" : result.reason).toContain("hides the amount on vault_out");
	});

	// The change is not one of the outputs the wallet adds, so it is the one the guard finds
	// by position rather than by name — and getting that wrong would pass everything.
	test("refuses a published change where the wallet decided to hide it", () => {
		const result = guardBlindedOutputs(build(true, false), hides);

		expect(result.ok).toBe(false);
		expect(result.ok ? "" : result.reason).toContain("publishes the amount on the change");
	});
});
