import { describe, expect, test } from "bun:test";

import groupedManifest from "./__fixtures__/p2pk-grouped.manifest.json";
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
const WALLET_SCRIPT = "0014" + "11".repeat(20);
const readFeeRate = async () => 1000;
const fundingUtxos = [
	{ amount: "1000000", spendable: true, txid: "c".repeat(64), txOut: "00", vout: 0 },
];

/** The three dependencies every case shares; individual tests override what they exercise. */
const deps = {
	compile,
	fundingUtxos,
	network: "liquid",
	readFeeRate,
	walletScriptPubKeyHex: WALLET_SCRIPT,
};
const POLICY_ASSET = "144c654344aa716d6f3abcc1ca90e5641e4e2a7f633bc09fe3baf64585819a49";
const readTxOut =
	(address: string, amountSats = "42000") =>
	async () => ({
		amountSats,
		rawAssetId: POLICY_ASSET,
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
				...deps,
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
				...deps,
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
				...deps,
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

		// A transaction that verified a covenant and then did not spend it would be a
		// silently different transaction from the one reviewed.
		test("carries the covenant it verified, ready to be spent", async () => {
			const result = await reviewManifestAction(spendRequest(oneCovenantUtxo), {
				...deps,
				readTxOut: readTxOut(DERIVED),
			});

			expect(isRefusal(result)).toBe(false);

			if (!isRefusal(result)) {
				expect(result.covenantInputs).toHaveLength(1);
				expect(result.covenantInputs[0]).toMatchObject({ txid: TXID, vout: 0 });
				// The source it carries is the one that was verified, not a second read.
				expect(result.covenantInputs[0]?.source).toBe(SOURCE);
			}
		});

		// A covenant output cannot be confidential — Simplicity cannot read a confidential
		// commitment — so one that comes back without an explicit amount is a refusal rather
		// than something to encode a guess for.
		test("refuses a covenant output the chain reports as confidential", async () => {
			const result = await reviewManifestAction(spendRequest(oneCovenantUtxo), {
				...deps,
				readTxOut: async () => ({
					scriptPubKeyAddress: DERIVED,
					scriptPubKeyHex: "5120aabb",
				}),
			});

			expect(isRefusal(result)).toBe(true);
		});

		// The output pays out what the covenant holds, and what it holds is read from the
		// chain — so a request understating the balance cannot make the wallet pay less.
		test("pays out the amount the chain reports, not one the request supplied", async () => {
			const result = await reviewManifestAction(spendRequest(oneCovenantUtxo), {
				...deps,
				readTxOut: readTxOut(DERIVED, "77000"),
			});

			expect(isRefusal(result)).toBe(false);

			if (!isRefusal(result)) {
				expect(result.outputs).toContainEqual({
					id: "received_out",
					sats: 77_000n,
					scriptPubKeyHex: WALLET_SCRIPT,
				});
			}
		});

		test("refuses when the funds are somewhere else", async () => {
			const result = await reviewManifestAction(spendRequest(oneCovenantUtxo), {
				...deps,
				readTxOut: readTxOut("tex1p_somewhere_else"),
			});

			expect(isRefusal(result)).toBe(true);
		});

		test("refuses when the state file lists no such covenant", async () => {
			const result = await reviewManifestAction(spendRequest({ utxos: [] }), {
				...deps,
				readTxOut: readTxOut(DERIVED),
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
		});

		test("refuses before reading anything when the state file is absent", async () => {
			const result = await reviewManifestAction(
				request({ action: "Receive", params: { pubkey: PUBKEY } }),
				{ ...deps, readTxOut: readTxOut(DERIVED) },
			);

			expect(isRefusal(result)).toBe(true);
		});
	});

	test("refuses a request missing a part the action needs, naming it", async () => {
		const result = await reviewManifestAction(request({ contractSources: {} }), {
			...deps,
			readTxOut: readTxOut(DERIVED),
		});

		expect(isRefusal(result)).toBe(true);

		if (isRefusal(result)) {
			expect(result.reason).toContain(SOURCE_PATH);
		}
	});

	test("refuses when the contract does not compile", async () => {
		const result = await reviewManifestAction(request(), {
			...deps,
			compile: () => {
				throw new Error("parse error");
			},
			readTxOut: readTxOut(DERIVED),
		});

		expect(isRefusal(result)).toBe(true);
	});
});

// The runtime core, observed where it actually matters: at the seam the wallet method
// calls, not only in the units beneath it.
describe("reviewManifestAction reads through the runtime core", () => {
	const grouped = (overrides: Partial<ParsedLiquidProcessCtParams> = {}) =>
		request({
			manifest: groupedManifest as unknown as Record<string, unknown>,
			...overrides,
		});

	// AC-10 at the review seam: the grouped twin of the published manifest is reviewed
	// into the same transaction, so nothing a person is shown depends on which shape the
	// site chose.
	test("reviews a grouped manifest into the same result as the flat one", async () => {
		const flat = await reviewManifestAction(request(), { ...deps, readTxOut: readTxOut("unused") });
		const fromGrouped = await reviewManifestAction(grouped(), {
			...deps,
			readTxOut: readTxOut("unused"),
		});

		expect(isRefusal(fromGrouped)).toBe(false);

		if (!isRefusal(flat) && !isRefusal(fromGrouped)) {
			expect(fromGrouped.covenants).toEqual(flat.covenants);
			expect(fromGrouped.outputs).toEqual(flat.outputs);
			expect(fromGrouped.selected).toEqual(flat.selected);
		}
	});

	test("reports the legacy spelling the grouped document used", async () => {
		const result = await reviewManifestAction(grouped(), {
			...deps,
			readTxOut: readTxOut("unused"),
		});

		if (!isRefusal(result)) {
			expect(result.normalisation).toContainEqual({
				at: "manifest",
				canonical: "manifest_version",
				found: "compose_version",
			});
		}
	});

	// AC-02, decorative half: the published manifest carries attestation_version, which no
	// implementation reads. Ignoring it is right; ignoring it without saying so is not.
	test("records the constructs it ignored rather than dropping them", async () => {
		const result = await reviewManifestAction(request(), {
			...deps,
			readTxOut: readTxOut("unused"),
		});

		if (!isRefusal(result)) {
			expect(result.ignoredConstructs.map((finding) => finding.key)).toContain(
				"attestation_version",
			);
		}
	});

	test("keeps a load-bearing construct out of the ignored list", async () => {
		const result = await reviewManifestAction(request(), {
			...deps,
			readTxOut: readTxOut("unused"),
		});

		if (!isRefusal(result)) {
			expect(result.ignoredConstructs.map((finding) => finding.key)).not.toContain("validations");
		}
	});
});
