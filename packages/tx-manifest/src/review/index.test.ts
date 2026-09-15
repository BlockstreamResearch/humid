import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import p2pkManifest from "../__fixtures__/p2pk.manifest.json";
import type { TxOutAtOutPoint } from "../chain/chainRead";
import { isRefusal, reviewManifestAction } from "../index";
import type { ParsedLiquidProcessCtParams } from "../request/request";

// The fixture is the published p2pk manifest and its contract source, unmodified. What the
// review is expected to report comes from that document and from the compiler fake below —
// never from re-deriving it the way the code under test does.

const SOURCE_PATH = "./p2pk.simf";
const SOURCE = readFileSync(new URL("../__fixtures__/p2pk.simf", import.meta.url), "utf8");
const PUBKEY = "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
const TXID = "b".repeat(64);
const MANIFEST = p2pkManifest as unknown as Record<string, unknown>;

// A compile yields both spellings of where the covenant is. They are distinct on purpose:
// the address is what a person is shown, the scriptPubKey is what an output pays to and what
// the chain is compared against, and only one of them is hex.
const DERIVED = "tex1p_derived";
const DERIVED_SCRIPT = `5120${"11".repeat(32)}`;
/** A script that is not the covenant's, for the cases where the chain must disagree. */
const ELSEWHERE_SCRIPT = `5120${"22".repeat(32)}`;
const COMPILED = { address: DERIVED, scriptPubKeyHex: DERIVED_SCRIPT };

const compile = () => COMPILED;
/** The same compiler again, for the hashes a document works out for itself. */
const scriptPubKeyOf = () => DERIVED_SCRIPT;

/** The wallet's own side of the transaction: where it pays, what it holds, what a fee costs. */
const POLICY_ASSET = "144c654344aa716d6f3abcc1ca90e5641e4e2a7f633bc09fe3baf64585819a49";
const WALLET_SCRIPT = `0014${"33".repeat(20)}`;
const fundingUtxos = [
	{ amount: "1000000", spendable: true, txOut: "00", txid: "c".repeat(64), vout: 0 },
];
const readFeeRate = async () => 1000;

/** What every case shares; individual tests override only what they exercise. */
const deps = {
	accountLabel: "liquid:testnet account 0",
	compile,
	scriptPubKeyOf,
	fundingUtxos,
	network: "liquid",
	policyAsset: POLICY_ASSET,
	readFeeRate,
	walletScriptPubKeyHex: WALLET_SCRIPT,
};

/**
 * What the chain says sits at an outpoint, as a reader that reports everything.
 *
 * The amount and the asset are stated rather than left out, because a covenant output on this
 * network cannot be confidential and still work — a Simplicity program reads exact amounts
 * through jets that cannot introspect a commitment — so a reader that omitted them would be
 * standing in for something no legitimate deployment produces, and the review refuses it.
 */
const chainHolding = (scriptPubKeyHex: string) => async (): Promise<TxOutAtOutPoint> => ({
	amountSats: COVENANT_HOLDS,
	rawAssetId: POLICY_ASSET,
	scriptPubKeyHex,
});

/** What every covenant in these cases is holding, in the asset the network charges fees in. */
const COVENANT_HOLDS = "50000";

function request(
	overrides: Partial<ParsedLiquidProcessCtParams> = {},
): ParsedLiquidProcessCtParams {
	return {
		action: "Pay",
		broadcast: false,
		contractSources: { [SOURCE_PATH]: SOURCE },
		manifest: MANIFEST,
		params: { amount_sat: 1000, pubkey: PUBKEY },
		...overrides,
	};
}

/** The Receive action, which spends the covenant the state file locates. */
const spendRequest = (state?: unknown) =>
	request({
		action: "Receive",
		params: { pubkey: PUBKEY },
		...(state === undefined ? {} : { state: state as Record<string, unknown> }),
	});

const oneCovenantUtxo = { utxos: [{ txid: TXID, utxo_type: "p2pk_output", vout: 0 }] };

describe("reviewManifestAction", () => {
	// Pay creates a covenant output. There is nothing on chain yet, so the wallet reports what
	// it derived and says plainly that it has not compared it against anything.
	describe("creating a covenant", () => {
		test("reports the derived covenant as not yet on chain", async () => {
			const result = await reviewManifestAction(request(), {
				...deps,
				readTxOut: chainHolding(DERIVED_SCRIPT),
			});

			expect(isRefusal(result)).toBe(false);

			if (!isRefusal(result)) {
				expect(result.action).toBe("Pay");
				expect(result.protocol).toBe("p2pk-simplicity");
				expect(result.covenants).toEqual([
					{
						address: DERIVED,
						argumentsJson: JSON.stringify({ PUB_KEY: { type: "Pubkey", value: `0x${PUBKEY}` } }),
						extraLeavesJson: "[]",
						includeDebugSymbols: false,
						role: "created",
						scriptPubKeyHex: DERIVED_SCRIPT,
						source: SOURCE,
						sourcePath: SOURCE_PATH,
						utxoType: "p2pk_output",
						verified: "not-yet-on-chain",
					},
				]);
			}
		});

		test("never consults the chain for something that does not exist yet", async () => {
			let asked = 0;

			await reviewManifestAction(request(), {
				...deps,
				readTxOut: async () => {
					asked += 1;

					return {
						amountSats: COVENANT_HOLDS,
						rawAssetId: POLICY_ASSET,
						scriptPubKeyHex: DERIVED_SCRIPT,
					};
				},
			});

			expect(asked).toBe(0);
		});

		test("compiles against the parameters the manifest wires in", async () => {
			const seen: string[] = [];

			await reviewManifestAction(request(), {
				...deps,
				compile: (input) => {
					seen.push(input.argumentsJson);

					return COMPILED;
				},
				readTxOut: chainHolding(DERIVED_SCRIPT),
			});

			// PUB_KEY is wired to params.pubkey, declared `pubkey` by the action.
			expect(seen).toEqual([JSON.stringify({ PUB_KEY: { type: "Pubkey", value: `0x${PUBKEY}` } })]);
		});
	});

	// Receive spends the covenant. This is where the wallet's derivation is checked against
	// something it did not get from the requester.
	describe("spending a covenant", () => {
		// Receive's output pays what the covenant input turned out to hold — `p2pk_in.amount_sat`,
		// a figure the wallet read from the chain rather than one the document states. So the
		// review resolving at all is the whole of what this asserts: the covenant was rebuilt,
		// compared against what is at the outpoint, and the amount that reads it came out as
		// what the chain reported.
		test("gets past verification when the rebuilt contract locks the funds that are there", async () => {
			const result = await reviewManifestAction(spendRequest(oneCovenantUtxo), {
				...deps,
				readTxOut: chainHolding(DERIVED_SCRIPT),
			});

			expect(isRefusal(result)).toBe(false);

			if (!isRefusal(result)) {
				expect(result.covenants.map((found) => found.verified)).toEqual(["matches-chain"]);
				expect(result.outputs.find((output) => output.id === "received_out")?.sats).toBe(
					BigInt(COVENANT_HOLDS),
				);
			}
		});

		test("reads the outpoint the state file names", async () => {
			const asked: { txid: string; vout: number }[] = [];

			await reviewManifestAction(spendRequest(oneCovenantUtxo), {
				...deps,
				readTxOut: async (outpoint) => {
					asked.push(outpoint);

					return { scriptPubKeyHex: DERIVED_SCRIPT };
				},
			});

			expect(asked).toEqual([{ txid: TXID, vout: 0 }]);
		});

		test("refuses when the funds are locked by something else", async () => {
			const result = await reviewManifestAction(spendRequest(oneCovenantUtxo), {
				...deps,
				readTxOut: chainHolding(ELSEWHERE_SCRIPT),
			});

			expect(isRefusal(result)).toBe(true);

			if (isRefusal(result)) {
				expect(result.reason).toContain("p2pk_output");
			}
		});

		test("refuses when the state file lists no such covenant", async () => {
			const result = await reviewManifestAction(spendRequest({ utxos: [] }), {
				...deps,
				readTxOut: chainHolding(DERIVED_SCRIPT),
			});

			expect(isRefusal(result)).toBe(true);
		});

		test("refuses before reading anything when the state file is absent", async () => {
			const result = await reviewManifestAction(spendRequest(), {
				...deps,
				readTxOut: chainHolding(DERIVED_SCRIPT),
			});

			expect(isRefusal(result)).toBe(true);
		});

		test("refuses when the chain cannot be read, rather than proceeding unchecked", async () => {
			const result = await reviewManifestAction(spendRequest(oneCovenantUtxo), {
				...deps,
				readTxOut: async () => {
					throw new Error("offline");
				},
			});

			expect(isRefusal(result)).toBe(true);

			if (isRefusal(result)) {
				expect(result.reason).toContain("offline");
			}
		});
	});

	test("refuses a request missing a part the action needs, naming it", async () => {
		const result = await reviewManifestAction(request({ contractSources: {} }), {
			...deps,
			readTxOut: chainHolding(DERIVED_SCRIPT),
		});

		expect(isRefusal(result)).toBe(true);

		if (isRefusal(result)) {
			expect(result.reason).toContain(SOURCE_PATH);
		}
	});

	test("refuses an action the manifest does not declare, naming it", async () => {
		const result = await reviewManifestAction(request({ action: "Withdraw" }), {
			...deps,
			readTxOut: chainHolding(DERIVED_SCRIPT),
		});

		expect(isRefusal(result)).toBe(true);

		if (isRefusal(result)) {
			expect(result.reason).toContain("Withdraw");
		}
	});

	// Everything below is the transaction the review settles, so that what a person approves
	// is what gets signed rather than a description of it reassembled afterwards.
	describe("the transaction it settles", () => {
		test("pays the covenant output the script it derived, not the address it is shown as", async () => {
			const result = await reviewManifestAction(request(), {
				...deps,
				readTxOut: chainHolding(DERIVED_SCRIPT),
			});

			expect(isRefusal(result)).toBe(false);

			if (!isRefusal(result)) {
				expect(result.outputs).toEqual([
					// A covenant output is answered before the format's precedence is consulted: a
					// Simplicity program reads exact amounts through jets that cannot introspect a
					// commitment, so a hidden one is an output its own contract could never check.
					{
						asset: POLICY_ASSET,
						blinded: false,
						decidedBy: "unblindable",
						id: "p2pk_out",
						sats: 1000n,
						scriptPubKeyHex: DERIVED_SCRIPT,
					},
				]);
			}
		});

		// The builder hex-decodes every script it is handed, so a bech32 address fails inside
		// the module with an error naming neither the output nor what was wrong with it.
		test("gives every output a script the builder can decode", async () => {
			const result = await reviewManifestAction(request(), {
				...deps,
				readTxOut: chainHolding(DERIVED_SCRIPT),
			});

			expect(isRefusal(result)).toBe(false);

			if (!isRefusal(result)) {
				expect(result.outputs.length).toBeGreaterThan(0);

				for (const output of result.outputs) {
					expect(output.scriptPubKeyHex).toMatch(/^(?:[0-9a-fA-F]{2})+$/);
				}
			}
		});

		// Change carries no amount, because change is whatever is left after the fee — and the
		// fee is not known until the transaction has a shape.
		test("plans no output for the change the action declares", async () => {
			const result = await reviewManifestAction(request(), {
				...deps,
				readTxOut: chainHolding(DERIVED_SCRIPT),
			});

			expect(isRefusal(result)).toBe(false);

			if (!isRefusal(result)) {
				expect(result.outputs.map((output) => output.id)).not.toContain("change_out");
			}
		});

		test("selects the wallet's own outputs to fund it, and reports the rate it will pay", async () => {
			const result = await reviewManifestAction(request(), {
				...deps,
				readTxOut: chainHolding(DERIVED_SCRIPT),
			});

			expect(isRefusal(result)).toBe(false);

			if (!isRefusal(result)) {
				expect(result.feeRateSatsPerKvb).toBe(1000);
				expect(result.selected).toEqual(fundingUtxos);
			}
		});

		// The fee is the wallet's business: the request carries none, and an action is refused
		// rather than built when no rate can be established. A default here would quietly turn
		// "we do not know" into "we are sure".
		test("refuses when no fee rate can be established, rather than assuming one", async () => {
			const result = await reviewManifestAction(request(), {
				...deps,
				readFeeRate: async () => {
					throw new Error("no estimate");
				},
				readTxOut: chainHolding(DERIVED_SCRIPT),
			});

			expect(isRefusal(result)).toBe(true);

			if (isRefusal(result)) {
				expect(result.reason).toContain("fee rate");
			}
		});

		test("refuses when the account cannot cover the action and its fee", async () => {
			const result = await reviewManifestAction(request(), {
				...deps,
				fundingUtxos: [
					{ amount: "10", spendable: true, txOut: "00", txid: "d".repeat(64), vout: 0 },
				],
				readTxOut: chainHolding(DERIVED_SCRIPT),
			});

			expect(isRefusal(result)).toBe(true);
		});

		test("refuses an amount this runtime does not evaluate, rather than guessing one", async () => {
			const result = await reviewManifestAction(
				request({ params: { amount_sat: "params.amount_sat - fee", pubkey: PUBKEY } }),
				{ ...deps, readTxOut: chainHolding(DERIVED_SCRIPT) },
			);

			expect(isRefusal(result)).toBe(true);
		});
	});

	test("refuses when the contract does not compile", async () => {
		const result = await reviewManifestAction(request(), {
			...deps,
			compile: () => {
				throw new Error("parse error");
			},
			readTxOut: chainHolding(DERIVED_SCRIPT),
		});

		expect(isRefusal(result)).toBe(true);

		if (isRefusal(result)) {
			expect(result.reason).toContain(SOURCE_PATH);
		}
	});
});
