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

const chainHolding = (scriptPubKeyHex: string) => async (): Promise<TxOutAtOutPoint> => ({
	scriptPubKeyHex,
});

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
				compile,
				network: "liquid",
				readTxOut: chainHolding(DERIVED_SCRIPT),
			});

			expect(isRefusal(result)).toBe(false);

			if (!isRefusal(result)) {
				expect(result.action).toBe("Pay");
				expect(result.protocol).toBe("p2pk-simplicity");
				expect(result.covenants).toEqual([
					{
						address: DERIVED,
						role: "created",
						scriptPubKeyHex: DERIVED_SCRIPT,
						utxoType: "p2pk_output",
						verified: "not-yet-on-chain",
					},
				]);
			}
		});

		test("never consults the chain for something that does not exist yet", async () => {
			let asked = 0;

			await reviewManifestAction(request(), {
				compile,
				network: "liquid",
				readTxOut: async () => {
					asked += 1;

					return { scriptPubKeyHex: DERIVED_SCRIPT };
				},
			});

			expect(asked).toBe(0);
		});

		test("compiles against the parameters the manifest wires in", async () => {
			const seen: string[] = [];

			await reviewManifestAction(request(), {
				compile: (input) => {
					seen.push(input.argumentsJson);

					return COMPILED;
				},
				network: "liquid",
				readTxOut: chainHolding(DERIVED_SCRIPT),
			});

			// PUB_KEY is wired to params.pubkey, declared `pubkey` by the action.
			expect(seen).toEqual([JSON.stringify({ PUB_KEY: { type: "Pubkey", value: `0x${PUBKEY}` } })]);
		});
	});

	// Receive spends the covenant. This is where the wallet's derivation is checked against
	// something it did not get from the requester.
	describe("spending a covenant", () => {
		test("passes when the rebuilt contract locks the funds that are there", async () => {
			const result = await reviewManifestAction(spendRequest(oneCovenantUtxo), {
				compile,
				network: "liquid",
				readTxOut: chainHolding(DERIVED_SCRIPT),
			});

			expect(isRefusal(result)).toBe(false);

			if (!isRefusal(result)) {
				expect(result.covenants).toEqual([
					{
						address: DERIVED,
						role: "spent",
						scriptPubKeyHex: DERIVED_SCRIPT,
						utxoType: "p2pk_output",
						verified: "matches-chain",
					},
				]);
			}
		});

		test("reads the outpoint the state file names", async () => {
			const asked: { txid: string; vout: number }[] = [];

			await reviewManifestAction(spendRequest(oneCovenantUtxo), {
				compile,
				network: "liquid",
				readTxOut: async (outpoint) => {
					asked.push(outpoint);

					return { scriptPubKeyHex: DERIVED_SCRIPT };
				},
			});

			expect(asked).toEqual([{ txid: TXID, vout: 0 }]);
		});

		test("refuses when the funds are locked by something else", async () => {
			const result = await reviewManifestAction(spendRequest(oneCovenantUtxo), {
				compile,
				network: "liquid",
				readTxOut: chainHolding(ELSEWHERE_SCRIPT),
			});

			expect(isRefusal(result)).toBe(true);

			if (isRefusal(result)) {
				expect(result.reason).toContain("p2pk_output");
			}
		});

		test("refuses when the state file lists no such covenant", async () => {
			const result = await reviewManifestAction(spendRequest({ utxos: [] }), {
				compile,
				network: "liquid",
				readTxOut: chainHolding(DERIVED_SCRIPT),
			});

			expect(isRefusal(result)).toBe(true);
		});

		test("refuses before reading anything when the state file is absent", async () => {
			const result = await reviewManifestAction(spendRequest(), {
				compile,
				network: "liquid",
				readTxOut: chainHolding(DERIVED_SCRIPT),
			});

			expect(isRefusal(result)).toBe(true);
		});

		test("refuses when the chain cannot be read, rather than proceeding unchecked", async () => {
			const result = await reviewManifestAction(spendRequest(oneCovenantUtxo), {
				compile,
				network: "liquid",
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
			compile,
			network: "liquid",
			readTxOut: chainHolding(DERIVED_SCRIPT),
		});

		expect(isRefusal(result)).toBe(true);

		if (isRefusal(result)) {
			expect(result.reason).toContain(SOURCE_PATH);
		}
	});

	test("refuses an action the manifest does not declare, naming it", async () => {
		const result = await reviewManifestAction(request({ action: "Withdraw" }), {
			compile,
			network: "liquid",
			readTxOut: chainHolding(DERIVED_SCRIPT),
		});

		expect(isRefusal(result)).toBe(true);

		if (isRefusal(result)) {
			expect(result.reason).toContain("Withdraw");
		}
	});

	test("refuses when the contract does not compile", async () => {
		const result = await reviewManifestAction(request(), {
			compile: () => {
				throw new Error("parse error");
			},
			network: "liquid",
			readTxOut: chainHolding(DERIVED_SCRIPT),
		});

		expect(isRefusal(result)).toBe(true);

		if (isRefusal(result)) {
			expect(result.reason).toContain(SOURCE_PATH);
		}
	});
});
