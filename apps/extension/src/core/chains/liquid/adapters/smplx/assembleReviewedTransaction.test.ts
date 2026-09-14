import { describe, expect, test } from "bun:test";

import type { ManifestReview } from "@humid/tx-manifest";

import {
	type AssembledTransaction,
	type AssemblingBuilder,
	assembleReviewedTransaction,
} from "./assembleReviewedTransaction";
import type { SmplxWasmModule } from "./loadSmplxWasm";

// A substitute rather than the real module, because what is under test is what this assembles
// and what it releases, not what the module makes of it. Its method names and shapes are the
// real binding's — `loadSmplxWasm.test.ts` is what holds that claim true — so a substitute that
// accepted anything could not let a call the real module refuses pass unnoticed.

const COVENANT_SCRIPT = `5120${"11".repeat(32)}`;
const WALLET_SCRIPT = `0014${"33".repeat(20)}`;
const CHANGE_SCRIPT = `0014${"44".repeat(20)}`;
const ASSET = "144c654344aa716d6f3abcc1ca90e5641e4e2a7f633bc09fe3baf64585819a49";
const SIGNED: AssembledTransaction = { feeSats: 300n, hex: "02000000", txid: "f".repeat(64) };
// A P2WPKH output consensus-encoded, which is what the real builder decodes and what the
// wallet's own snapshot already holds for an output it can spend.
const TXOUT_HEX = `01${"49".repeat(32)}0100000000000186a000160014${"00".repeat(20)}`;

type Recorded = {
	changes: { blindingKey: string | null | undefined; script: string }[];
	freed: number;
	outputs: { asset: string; sats: bigint; script: string }[];
	spends: { txOut: string; txid: string; vout: number }[];
};

// Narrow — it stands in for the four methods this module calls and nothing else — but exact
// for each of them. A substitute that drops an argument is a substitute that cannot fail when
// the wrong value is passed in it, which is how a bech32 address reached the real builder
// unremarked. `loadSmplxWasm.test.ts` is what holds these signatures to the real binding.
function substitute(recorded: Recorded): Pick<SmplxWasmModule, "TransactionBuilder"> {
	return {
		TransactionBuilder: class {
			addChange(script: string, blindingKey?: string | null) {
				recorded.changes.push({ blindingKey, script });
			}
			addOutput(script: string, sats: bigint, asset: string) {
				recorded.outputs.push({ asset, sats, script });
			}
			// The encoded output is recorded with the outpoint, because the module needs all three
			// and a substitute that ignores one cannot notice it going missing.
			addWalletInput(txid: string, vout: number, txOut: string) {
				recorded.spends.push({ txOut, txid, vout });
			}
			// Held across the wasm boundary, so the module under test releases it. A substitute
			// without this passes only because nothing checked that it was released.
			free() {
				recorded.freed += 1;
			}
		},
	} as unknown as Pick<SmplxWasmModule, "TransactionBuilder">;
}

function review(overrides: Partial<ManifestReview> = {}): ManifestReview {
	return {
		action: "Pay",
		covenants: [
			{
				address: "tex1p_derived",
				role: "created",
				scriptPubKeyHex: COVENANT_SCRIPT,
				utxoType: "p2pk_output",
				verified: "not-yet-on-chain",
			},
		],
		feeRateSatsPerKvb: 1000,
		outputs: [{ asset: ASSET, id: "p2pk_out", sats: 50_000n, scriptPubKeyHex: COVENANT_SCRIPT }],
		protocol: "p2pk-simplicity",
		selected: [
			{ amount: "1000000", spendable: true, txOut: TXOUT_HEX, txid: "c".repeat(64), vout: 0 },
		],
		...overrides,
	};
}

function subject(overrides: Partial<ManifestReview> = {}, finalize = () => SIGNED) {
	const recorded: Recorded = { changes: [], freed: 0, outputs: [], spends: [] };

	return {
		assemble: () =>
			assembleReviewedTransaction(review(overrides), {
				changeScriptPubKeyHex: CHANGE_SCRIPT,
				finalize,
				smplx: substitute(recorded),
			}),
		recorded,
	};
}

describe("assembleReviewedTransaction", () => {
	// The outpoint says which output; the encoding says what is in it. The module takes all
	// three and cannot read the third off the chain, so passing two is a transaction it
	// refuses — or worse, one it balances against an amount nobody supplied.
	test("spends exactly the wallet outputs the review selected, with what each holds", async () => {
		const { assemble, recorded } = subject();

		await assemble();

		expect(recorded.spends).toEqual([{ txOut: TXOUT_HEX, txid: "c".repeat(64), vout: 0 }]);
	});

	test("pays exactly the outputs the review planned, in the asset it worked out", async () => {
		const { assemble, recorded } = subject();

		await assemble();

		expect(recorded.outputs).toEqual([{ asset: ASSET, sats: 50_000n, script: COVENANT_SCRIPT }]);
	});

	// The builder hex-decodes every script it is given, so an address reaching it fails inside
	// the module with an error naming neither the output nor what was wrong with it.
	test("every output script is hex the builder can decode", async () => {
		const { assemble, recorded } = subject();

		await assemble();

		expect(recorded.outputs.length).toBeGreaterThan(0);

		for (const output of recorded.outputs) {
			expect(output.script).toMatch(/^(?:[0-9a-fA-F]{2})+$/);
		}
	});

	// Where change goes is the wallet's, and unset the module returns it to whichever address
	// the signer derives — a decision made somewhere the wallet cannot see it.
	test("returns change to the script the caller named, and to nothing else", async () => {
		const { assemble, recorded } = subject();

		await assemble();

		expect(recorded.changes).toEqual([{ blindingKey: undefined, script: CHANGE_SCRIPT }]);
	});

	// Nothing in this slice reads what the document wants hidden, so change is returned in the
	// open rather than hidden against a guess at the answer.
	test("passes no blinding key with the change", async () => {
		const { assemble, recorded } = subject();

		await assemble();

		expect(recorded.changes[0]?.blindingKey).toBeUndefined();
	});

	test("hands the finalizer the rate the review established, and returns what it made", async () => {
		const rates: number[] = [];
		const { assemble } = subject({}, ((_builder: AssemblingBuilder, rate: number) => {
			rates.push(rate);

			return SIGNED;
		}) as () => AssembledTransaction);

		const result = await assemble();

		expect(rates).toEqual([1000]);
		expect(result).toEqual({ ok: true, transaction: SIGNED });
	});

	// Nothing here acquires a mnemonic, builds a signer or signs. The one thing that can is
	// the caller's, which is what lets assembly be reviewed without a credential in reach.
	test("signs nothing itself: the finalizer is the only thing that finishes a transaction", async () => {
		let finalized = 0;
		const { assemble } = subject({}, () => {
			finalized += 1;

			return SIGNED;
		});

		await assemble();

		expect(finalized).toBe(1);
	});

	describe("what it releases", () => {
		test("releases the builder once the transaction is finished", async () => {
			const { assemble, recorded } = subject();

			await assemble();

			expect(recorded.freed).toBe(1);
		});

		// A refused action that leaks a builder leaks wasm memory a collector cannot see.
		test("releases the builder when the finalizer fails", async () => {
			const { assemble, recorded } = subject({}, () => {
				throw new Error("could not balance");
			});

			const result = await assemble();

			expect(result).toMatchObject({ ok: false });
			expect(recorded.freed).toBe(1);

			if (!result.ok) {
				expect(result.reason).toContain("could not balance");
			}
		});

		test("releases the builder when an output the module will not take throws", async () => {
			const recorded: Recorded = { changes: [], freed: 0, outputs: [], spends: [] };
			const smplx = {
				TransactionBuilder: class {
					addChange() {}
					addOutput() {
						throw new Error("Invalid script: Odd number of digits");
					}
					addWalletInput() {}
					free() {
						recorded.freed += 1;
					}
				},
			} as unknown as Pick<SmplxWasmModule, "TransactionBuilder">;

			const result = await assembleReviewedTransaction(review(), {
				changeScriptPubKeyHex: CHANGE_SCRIPT,
				finalize: () => SIGNED,
				smplx,
			});

			expect(result).toMatchObject({ ok: false });
			expect(recorded.freed).toBe(1);
		});

		// A change script the module will not decode fails the same way an output does, and
		// after every input has already been added.
		test("releases the builder when the change script is refused", async () => {
			const recorded: Recorded = { changes: [], freed: 0, outputs: [], spends: [] };
			let finalized = 0;
			const smplx = {
				TransactionBuilder: class {
					addChange() {
						throw new Error("Invalid script: Odd number of digits");
					}
					addOutput() {}
					addWalletInput() {}
					free() {
						recorded.freed += 1;
					}
				},
			} as unknown as Pick<SmplxWasmModule, "TransactionBuilder">;

			const result = await assembleReviewedTransaction(review(), {
				changeScriptPubKeyHex: "tex1q_wallet",
				finalize: () => {
					finalized += 1;

					return SIGNED;
				},
				smplx,
			});

			expect(result).toMatchObject({ ok: false });
			expect(recorded.freed).toBe(1);
			// Nothing is signed once the transaction could not be finished being assembled.
			expect(finalized).toBe(0);
		});
	});

	describe("what it will not build", () => {
		// Receive spends the covenant, and this wallet has neither the amount reference its
		// output needs nor the signing witness its spend needs. Building the rest of it would be
		// a transaction the covenant refuses at execution, after a person approved it.
		test("refuses an action that spends a covenant rather than building part of it", async () => {
			const { assemble, recorded } = subject({
				action: "Receive",
				covenants: [
					{
						address: "tex1p_derived",
						role: "spent",
						scriptPubKeyHex: COVENANT_SCRIPT,
						utxoType: "p2pk_output",
						verified: "matches-chain",
					},
				],
			});

			const result = await assemble();

			expect(result).toMatchObject({ ok: false });
			expect(recorded.spends).toEqual([]);
			expect(recorded.outputs).toEqual([]);

			if (!result.ok) {
				expect(result.reason).toContain("p2pk_output");
			}
		});

		test("refuses when nothing of the wallet's funds it", async () => {
			const { assemble } = subject({ selected: [] });

			expect(await assemble()).toMatchObject({ ok: false });
		});

		test("refuses when there is nothing to pay", async () => {
			const { assemble } = subject({ outputs: [] });

			expect(await assemble()).toMatchObject({ ok: false });
		});

		test("builds nothing at all when it refuses", async () => {
			const { assemble, recorded } = subject({ selected: [] });

			await assemble();

			expect(recorded.freed).toBe(0);
			expect(recorded.outputs).toEqual([]);
		});
	});

	// The wallet's own output is one the review derived from an address, not one this reads
	// off a signer. Deriving a script from an address is public work.
	test("pays a wallet output the script the review derived", async () => {
		const { assemble, recorded } = subject({
			outputs: [{ asset: ASSET, id: "received_out", sats: 10n, scriptPubKeyHex: WALLET_SCRIPT }],
		});

		await assemble();

		expect(recorded.outputs).toEqual([{ asset: ASSET, sats: 10n, script: WALLET_SCRIPT }]);
	});
});
