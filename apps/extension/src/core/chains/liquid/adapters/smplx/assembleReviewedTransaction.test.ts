import { describe, expect, test } from "bun:test";

import type { ManifestReview } from "@humid/tx-manifest";

import {
	type AssembledTransaction,
	type AssemblingBuilder,
	assembleReviewedTransaction,
} from "./assembleReviewedTransaction";
// A substitute rather than the real module, because what is under test is what this assembles
// and what it releases, not what the module makes of it. Its method names and shapes are the
// real binding's — `loadSmplxWasm.test.ts` is what holds that claim true — so a substitute that
// accepted anything could not let a call the real module refuses pass unnoticed.

const COVENANT_SCRIPT = `5120${"11".repeat(32)}`;
/**
 * What the review says the covenant was built from, carried through rather than re-resolved.
 *
 * All four, because a module spending this covenant compiles the contract again to satisfy it and
 * a compile differing in any one of them produces a different script.
 */
const COVENANT_BUILD = {
	argumentsJson: '{"PUB_KEY":{"type":"Pubkey","value":"0x00"}}',
	extraLeavesJson: "[]",
	includeDebugSymbols: false,
	source: "fn main() { }",
	sourcePath: "./p2pk.simf",
};
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
	/** How many issuance reports were released, which must match how many were handed over. */
	freedReports: number;
	issues: {
		assetAmountSats: bigint;
		inflationAmountSats: bigint;
		issuerContractHex: string | undefined;
		txOut: string;
		txid: string;
		vout: number;
	}[];
	outputs: {
		asset: string;
		blindingKey: string | null | undefined;
		sats: bigint;
		script: string;
	}[];
	spends: { txOut: string; txid: string; vout: number }[];
};

/** What the derivation in the review says, so a substitute can agree with it or not. */
const ISSUED = {
	asset: "ce091c998b83c78bb71a632313ba3760f1763d9cfcffae02258ffa9865a37bd2",
	entropy: "a".repeat(64),
	reissuanceToken: "59fe4d2127ba9f16bd6850a3e6271a166e7ed2e1669f6c107d655791c94ee98f",
};

const ISSUANCE_TXID = "c".repeat(64);

/** One planned issuance derived from the wallet output the review selected. */
const plannedIssuance = () => ({
	asset: ISSUED.asset,
	assetAmountSats: 1000n,
	entropy: ISSUED.entropy,
	inflationAmountSats: 0n,
	inputId: "mint_in",
	kind: "new" as const,
	outpoint: { txid: ISSUANCE_TXID, vout: 0 },
	reissuanceToken: ISSUED.reissuanceToken,
});

// Narrow — it stands in for the four methods this module calls and nothing else — but exact
// for each of them. A substitute that drops an argument is a substitute that cannot fail when
// the wrong value is passed in it, which is how a bech32 address reached the real builder
// unremarked. `loadSmplxWasm.test.ts` is what holds these signatures to the real binding.
function substitute(
	recorded: Recorded,
	/** What the module claims it derived, which the wallet's own derivation is compared against. */
	reports: Partial<typeof ISSUED> = {},
): SmplxModule {
	return {
		TransactionBuilder: class {
			addChange(script: string, blindingKey?: string | null) {
				recorded.changes.push({ blindingKey, script });
			}
			addOutput(script: string, sats: bigint, asset: string, blindingKey?: string | null) {
				recorded.outputs.push({ asset, blindingKey, sats, script });
			}
			// The encoded output is recorded with the outpoint, because the module needs all three
			// and a substitute that ignores one cannot notice it going missing.
			addWalletInput(txid: string, vout: number, txOut: string) {
				recorded.spends.push({ txOut, txid, vout });
			}
			addWalletIssuanceInput(
				txid: string,
				vout: number,
				txOut: string,
				assetAmountSats: bigint,
				inflationAmountSats: bigint,
				issuerContractHex?: string,
			) {
				recorded.issues.push({
					assetAmountSats,
					inflationAmountSats,
					issuerContractHex,
					txOut,
					txid,
					vout,
				});

				return {
					assetId: reports.asset ?? ISSUED.asset,
					entropy: reports.entropy ?? ISSUED.entropy,
					free: () => {
						recorded.freedReports += 1;
					},
					reissuanceTokenId: reports.reissuanceToken ?? ISSUED.reissuanceToken,
				};
			}
			// Held across the wasm boundary, so the module under test releases it. A substitute
			// without this passes only because nothing checked that it was released.
			free() {
				recorded.freed += 1;
			}
		},
	};
}

/** What this module needs of the SDK, which is what it states for itself. */
type SmplxModule = { TransactionBuilder: new () => AssemblingBuilder };

function review(overrides: Partial<ManifestReview> = {}): ManifestReview {
	return {
		action: "Pay",
		covenants: [
			{
				address: "tex1p_derived",
				...COVENANT_BUILD,
				role: "created",
				scriptPubKeyHex: COVENANT_SCRIPT,
				utxoType: "p2pk_output",
				verified: "not-yet-on-chain",
			},
		],
		changeBlinded: false,
		changeOverrode: "chain",
		feeRateSatsPerKvb: 1000,
		issuances: [],
		normalisation: [],
		outputs: [
			{
				asset: ASSET,
				blinded: false,
				decidedBy: "unblindable",
				id: "p2pk_out",
				sats: 50_000n,
				scriptPubKeyHex: COVENANT_SCRIPT,
			},
		],
		protocol: "p2pk-simplicity",
		selected: [
			{ amount: "1000000", spendable: true, txOut: TXOUT_HEX, txid: "c".repeat(64), vout: 0 },
		],
		...overrides,
	};
}

function subject(
	overrides: Partial<ManifestReview> = {},
	finalize = () => SIGNED,
	extra: { blindingPublicKeyHex?: string; reports?: Partial<typeof ISSUED> } = {},
) {
	const recorded: Recorded = {
		changes: [],
		freed: 0,
		freedReports: 0,
		issues: [],
		outputs: [],
		spends: [],
	};

	return {
		assemble: () =>
			assembleReviewedTransaction(review(overrides), {
				...(extra.blindingPublicKeyHex === undefined
					? {}
					: { blindingPublicKeyHex: extra.blindingPublicKeyHex }),
				changeScriptPubKeyHex: CHANGE_SCRIPT,
				finalize,
				smplx: substitute(recorded, extra.reports),
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

		expect(recorded.outputs).toEqual([
			{ asset: ASSET, blindingKey: undefined, sats: 50_000n, script: COVENANT_SCRIPT },
		]);
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
			const recorded: Recorded = {
				changes: [],
				freed: 0,
				freedReports: 0,
				issues: [],
				outputs: [],
				spends: [],
			};
			const smplx = substitute(recorded);

			smplx.TransactionBuilder.prototype.addOutput = () => {
				throw new Error("Invalid script: Odd number of digits");
			};

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
			const recorded: Recorded = {
				changes: [],
				freed: 0,
				freedReports: 0,
				issues: [],
				outputs: [],
				spends: [],
			};
			let finalized = 0;
			const smplx = substitute(recorded);

			smplx.TransactionBuilder.prototype.addChange = () => {
				throw new Error("Invalid script: Odd number of digits");
			};

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
						...COVENANT_BUILD,
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
			outputs: [
				{
					asset: ASSET,
					blinded: false,
					decidedBy: "output",
					id: "received_out",
					sats: 10n,
					scriptPubKeyHex: WALLET_SCRIPT,
				},
			],
		});

		await assemble();

		expect(recorded.outputs).toEqual([
			{ asset: ASSET, blindingKey: undefined, sats: 10n, script: WALLET_SCRIPT },
		]);
	});

	/**
	 * An issuing input is added once, as an issuance.
	 *
	 * The asset an issuance creates is a function of the output its input spends, so the two
	 * are joined on that outpoint and on nothing else. Adding the same output again as an
	 * ordinary wallet input would spend it twice, which is not a transaction at all.
	 */
	describe("an input that creates an asset", () => {
		const issuing = { issuances: [plannedIssuance()] };

		test("is added as an issuance, with the amounts the review resolved", async () => {
			const { assemble, recorded } = subject(issuing);

			await assemble();

			expect(recorded.issues).toEqual([
				{
					assetAmountSats: 1000n,
					// Zero, always: Liquid requires a reissuance token to be held confidentially
					// and this path builds transactions whose values are all explicit, so the
					// review refuses any other figure long before it reaches here.
					inflationAmountSats: 0n,
					// A manifest declares no issuer contract at any position, so both sides commit
					// to nothing and each says so.
					issuerContractHex: undefined,
					txOut: TXOUT_HEX,
					txid: ISSUANCE_TXID,
					vout: 0,
				},
			]);
		});

		test("and is not also added as an ordinary wallet input", async () => {
			const { assemble, recorded } = subject(issuing);

			await assemble();

			expect(recorded.spends).toEqual([]);
		});

		// Every other selected output is still an ordinary input. Only the one the asset is
		// derived from becomes the issuance.
		test("while the wallet's other outputs are added as they were", async () => {
			const { assemble, recorded } = subject({
				...issuing,
				selected: [
					{ amount: "1000000", spendable: true, txOut: TXOUT_HEX, txid: ISSUANCE_TXID, vout: 0 },
					{ amount: "2000", spendable: true, txOut: TXOUT_HEX, txid: "d".repeat(64), vout: 3 },
				],
			});

			await assemble();

			expect(recorded.issues).toHaveLength(1);
			expect(recorded.spends).toEqual([{ txOut: TXOUT_HEX, txid: "d".repeat(64), vout: 3 }]);
		});

		// The module derives the asset for itself from the same output. Two independent
		// derivations of one fact are compared rather than one of them being trusted.
		test("releases the module's report when the two sides agree", async () => {
			const { assemble, recorded } = subject(issuing);

			expect(await assemble()).toMatchObject({ ok: true });
			expect(recorded.freedReports).toBe(1);
		});

		test("refuses when the module reports a different asset", async () => {
			const { assemble } = subject(issuing, () => SIGNED, {
				reports: { asset: "b".repeat(64) },
			});

			const result = await assemble();

			expect(result).toMatchObject({ ok: false });

			if (!result.ok) {
				expect(result.reason).toContain("mint_in");
				expect(result.reason).toContain("asset");
			}
		});

		test("and when it reports a different entropy or reissuance token", async () => {
			const differentEntropy = await subject(issuing, () => SIGNED, {
				reports: { entropy: "b".repeat(64) },
			}).assemble();
			const differentToken = await subject(issuing, () => SIGNED, {
				reports: { reissuanceToken: "b".repeat(64) },
			}).assemble();

			expect(differentEntropy).toMatchObject({ ok: false });
			expect(differentToken).toMatchObject({ ok: false });
		});

		// The report is a handle across the wasm boundary like everything else the module
		// returns. A refusal that leaks one leaks it on exactly the path a person hits.
		test("releases the module's report on the path that refuses too", async () => {
			const { assemble, recorded } = subject(issuing, () => SIGNED, {
				reports: { asset: "b".repeat(64) },
			});

			await assemble();

			expect(recorded.freedReports).toBe(1);
			expect(recorded.freed).toBe(1);
		});

		/**
		 * The joins that are wrong about the whole transaction are settled before it exists.
		 *
		 * Each of these is a disagreement between the two lists a review carries rather than a
		 * fault in one input, and a check made while adding inputs would find it with half the
		 * transaction already built — leaving a builder to unwind and an error naming whichever
		 * input it happened to reach. Nothing is constructed, so nothing has to be released.
		 */
		describe("what it settles before starting a builder", () => {
			// An asset derived from an output no input spends is an id for something that would
			// never come to exist, and the person would already have been shown it.
			test("an issuance derived from an output this transaction does not spend", async () => {
				const { assemble, recorded } = subject({
					issuances: [{ ...plannedIssuance(), outpoint: { txid: "e".repeat(64), vout: 7 } }],
				});

				const result = await assemble();

				expect(result).toMatchObject({ ok: false });
				expect(recorded.freed).toBe(0);
				expect(recorded.spends).toEqual([]);
				expect(recorded.issues).toEqual([]);

				if (!result.ok) {
					expect(result.reason).toContain("mint_in");
				}
			});

			/**
			 * Two issuances claiming one output.
			 *
			 * Each is a well-formed id for a different asset, and both need that one output
			 * spent to exist. A map built from them without looking keeps the last and mints one
			 * asset while a person was shown two — silently, because nothing downstream holds
			 * both lists.
			 */
			test("two issuances derived from one output", async () => {
				const { assemble, recorded } = subject({
					issuances: [
						plannedIssuance(),
						{ ...plannedIssuance(), asset: "b".repeat(64), inputId: "mint_two" },
					],
				});

				const result = await assemble();

				expect(result).toMatchObject({ ok: false });
				expect(recorded.freed).toBe(0);
				expect(recorded.issues).toEqual([]);

				if (!result.ok) {
					expect(result.reason).toContain("mint_two");
					expect(result.reason).toContain("cannot create two assets");
				}
			});

			// Two descriptions of one output are one output. Adding both spends it twice.
			test("one of the wallet's outputs selected more than once", async () => {
				const spent = {
					amount: "1000000",
					spendable: true,
					txOut: TXOUT_HEX,
					txid: ISSUANCE_TXID,
					vout: 0,
				};
				const { assemble, recorded } = subject({ selected: [spent, { ...spent }] });

				const result = await assemble();

				expect(result).toMatchObject({ ok: false });
				expect(recorded.freed).toBe(0);
				expect(recorded.spends).toEqual([]);

				if (!result.ok) {
					expect(result.reason).toContain("more than once");
				}
			});

			// A txid is thirty-two bytes, and the same bytes in two cases are one output. A
			// check spelling its own key would let this through.
			test("and the same output written in two cases", async () => {
				const spent = {
					amount: "1000000",
					spendable: true,
					txOut: TXOUT_HEX,
					txid: ISSUANCE_TXID,
					vout: 0,
				};
				const { assemble, recorded } = subject({
					selected: [spent, { ...spent, txid: ISSUANCE_TXID.toUpperCase() }],
				});

				expect(await assemble()).toMatchObject({ ok: false });
				expect(recorded.freed).toBe(0);
			});
		});
	});

	/**
	 * Which outputs hide what they carry, and which do not.
	 *
	 * The decision is the document's and was made while reading it; the builder has never read
	 * the document. A key is passed for the outputs the review calls hidden and for no others —
	 * passing one to an open output hides an amount the protocol published on purpose, and
	 * withholding one from a hidden output publishes an amount it asked to keep.
	 */
	describe("blinding", () => {
		const BLINDING_KEY = `02${"55".repeat(32)}`;
		const hiddenAndOpen = {
			outputs: [
				{
					asset: ASSET,
					blinded: true,
					decidedBy: "chain" as const,
					id: "paid_out",
					sats: 10n,
					scriptPubKeyHex: WALLET_SCRIPT,
				},
				{
					asset: ASSET,
					blinded: false,
					decidedBy: "unblindable" as const,
					id: "p2pk_out",
					sats: 50_000n,
					scriptPubKeyHex: COVENANT_SCRIPT,
				},
			],
		};

		test("passes the key only to the outputs the review says are hidden", async () => {
			const { assemble, recorded } = subject(hiddenAndOpen, () => SIGNED, {
				blindingPublicKeyHex: BLINDING_KEY,
			});

			await assemble();

			expect(recorded.outputs).toEqual([
				{ asset: ASSET, blindingKey: BLINDING_KEY, sats: 10n, script: WALLET_SCRIPT },
				{ asset: ASSET, blindingKey: undefined, sats: 50_000n, script: COVENANT_SCRIPT },
			]);
		});

		// Deliberately open under the current design, so that the money comes back in a form the
		// next contract action can be funded from. The review says so outright rather than this
		// module assuming it.
		test("passes no key for change the review returns in the open", async () => {
			const { assemble, recorded } = subject({}, () => SIGNED, {
				blindingPublicKeyHex: BLINDING_KEY,
			});

			await assemble();

			expect(recorded.changes).toEqual([{ blindingKey: undefined, script: CHANGE_SCRIPT }]);
		});

		test("and passes it for change the review says must be hidden", async () => {
			const { assemble, recorded } = subject({ changeBlinded: true }, () => SIGNED, {
				blindingPublicKeyHex: BLINDING_KEY,
			});

			await assemble();

			expect(recorded.changes).toEqual([{ blindingKey: BLINDING_KEY, script: CHANGE_SCRIPT }]);
		});

		// Publishing an amount the protocol asked to keep cannot be taken back afterwards, so
		// nothing is built at all rather than built in the open.
		test("refuses a hidden output it was given no key for, building nothing", async () => {
			const { assemble, recorded } = subject(hiddenAndOpen);

			const result = await assemble();

			expect(result).toMatchObject({ ok: false });
			expect(recorded.freed).toBe(0);
			expect(recorded.outputs).toEqual([]);

			if (!result.ok) {
				expect(result.reason).toContain("paid_out");
			}
		});

		test("and refuses hidden change it was given no key for", async () => {
			expect(await subject({ changeBlinded: true }).assemble()).toMatchObject({ ok: false });
		});
	});
});
