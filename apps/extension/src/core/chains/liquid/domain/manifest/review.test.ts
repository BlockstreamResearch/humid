import { describe, expect, test } from "bun:test";

import p2pkManifest from "./__fixtures__/p2pk.manifest.json";
import { isRefusal, reviewManifestAction } from "./review";
import type { ParsedLiquidProcessCtParams } from "./types";

const PUBKEY = "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
const SOURCE_PATH = "./p2pk.simf";
const SOURCE =
	"fn main() { jet::bip_0340_verify((param::PUB_KEY, jet::sig_all_hash()), witness::SIGNATURE) }";
const TXID = "b".repeat(64);
const DERIVED = "tex1p_derived";

function request(
	overrides: Partial<ParsedLiquidProcessCtParams> = {},
): ParsedLiquidProcessCtParams {
	return {
		action: "Pay",
		broadcast: false,
		contractSources: { [SOURCE_PATH]: SOURCE },
		manifest: p2pkManifest as unknown as Record<string, unknown>,
		params: { amount_sat: 1000, pubkey: PUBKEY },
		...overrides,
	};
}

const compile = () => DERIVED;
const readTxOut = (address: string) => async () => ({
	scriptPubKeyAddress: address,
	scriptPubKeyHex: "5120aabb",
});

const spendRequest = (state: unknown) =>
	request({
		action: "Receive",
		params: { pubkey: PUBKEY },
		state: state as Record<string, unknown>,
	});

const oneCovenantUtxo = {
	utxos: [{ txid: TXID, utxo_type: "p2pk_output", vout: 0 }],
};

describe("reviewManifestAction", () => {
	// Pay creates a covenant output. There is nothing on chain yet, so the wallet reports
	// what it derived and says plainly that it has not compared it against anything.
	describe("creating a covenant", () => {
		test("reports the derived address as not yet on chain", async () => {
			const result = await reviewManifestAction(request(), {
				compile,
				network: "liquid",
				readTxOut: readTxOut("unused"),
			});

			expect(isRefusal(result)).toBe(false);

			if (!isRefusal(result)) {
				expect(result.covenants).toEqual([
					{
						address: DERIVED,
						role: "created",
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

					return { scriptPubKeyAddress: "x", scriptPubKeyHex: "00" };
				},
			});

			expect(asked).toBe(0);
		});
	});

	// Receive spends the covenant. This is where the wallet's derivation is checked against
	// something it did not get from the requester.
	describe("spending a covenant", () => {
		test("passes when the rebuilt contract lands where the funds are", async () => {
			const result = await reviewManifestAction(spendRequest(oneCovenantUtxo), {
				compile,
				network: "liquid",
				readTxOut: readTxOut(DERIVED),
			});

			expect(isRefusal(result)).toBe(false);

			if (!isRefusal(result)) {
				expect(result.covenants[0]).toMatchObject({
					role: "spent",
					verified: "matches-chain",
				});
			}
		});

		test("refuses when the funds are somewhere else", async () => {
			const result = await reviewManifestAction(spendRequest(oneCovenantUtxo), {
				compile,
				network: "liquid",
				readTxOut: readTxOut("tex1p_somewhere_else"),
			});

			expect(isRefusal(result)).toBe(true);
		});

		test("refuses when the state file lists no such covenant", async () => {
			const result = await reviewManifestAction(spendRequest({ utxos: [] }), {
				compile,
				network: "liquid",
				readTxOut: readTxOut(DERIVED),
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
		});

		test("refuses before reading anything when the state file is absent", async () => {
			const result = await reviewManifestAction(
				request({ action: "Receive", params: { pubkey: PUBKEY } }),
				{ compile, network: "liquid", readTxOut: readTxOut(DERIVED) },
			);

			expect(isRefusal(result)).toBe(true);
		});
	});

	test("refuses a request missing a part the action needs, naming it", async () => {
		const result = await reviewManifestAction(request({ contractSources: {} }), {
			compile,
			network: "liquid",
			readTxOut: readTxOut(DERIVED),
		});

		expect(isRefusal(result)).toBe(true);

		if (isRefusal(result)) {
			expect(result.reason).toContain(SOURCE_PATH);
		}
	});

	test("refuses when the contract does not compile", async () => {
		const result = await reviewManifestAction(request(), {
			compile: () => {
				throw new Error("parse error");
			},
			network: "liquid",
			readTxOut: readTxOut(DERIVED),
		});

		expect(isRefusal(result)).toBe(true);
	});
});
