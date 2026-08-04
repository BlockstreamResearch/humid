import { describe, expect, test } from "bun:test";

import groupedManifest from "./__fixtures__/p2pk-grouped.manifest.json";
import p2pkManifest from "./__fixtures__/p2pk.manifest.json";
import { estimateFeeSats } from "./fee";
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
	accountLabel: "liquid:testnet account 0",
	compile,
	compilerVersion: "0.6.0",
	policyAsset: "144c654344aa716d6f3abcc1ca90e5641e4e2a7f633bc09fe3baf64585819a49",
	fundingUtxos,
	network: "liquid",
	readFeeRate,
	// The p2pk manifest computes nothing, so this is never reached on these cases; a
	// covenant hash the manifest works out for itself is covered where it is built.
	scriptPubKeyOf: () => "5120aabb",
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

// AC-13: the fee and the fee rate are the wallet's alone.
describe("who decides the fee", () => {
	test("the rate comes from the chain, not from the request", async () => {
		const result = await reviewManifestAction(request(), {
			...deps,
			readFeeRate: async () => 1234,
			readTxOut: readTxOut("unused"),
		});

		expect(isRefusal(result)).toBe(false);

		if (!isRefusal(result)) {
			expect(result.feeRateSatsPerKvb).toBe(1234);
		}
	});

	test("refuses rather than defaulting when no rate can be established", async () => {
		const result = await reviewManifestAction(request(), {
			...deps,
			readFeeRate: async () => {
				throw new Error("no estimate");
			},
			readTxOut: readTxOut("unused"),
		});

		expect(isRefusal(result)).toBe(true);
		expect(isRefusal(result) ? result.reason : "").toContain("fee rate");
	});
});

// AC-09: an amount that is a function of the fee is worked out against the fee the wallet
// established, and the transaction it produces is the one the person is shown.
describe("an amount that depends on the fee", () => {
	// A one-input, one-output spend of the covenant, paying out what it holds less the fee.
	const feeAware = {
		actions: {
			Sweep: {
				inputs: [
					{
						id: "cov_in",
						utxo_source: { compile_params: { PUB_KEY: "params.pubkey" }, utxo_type: "p2pk_output" },
						witnesses: {
							SIGNATURE: { source: { key: "params.pubkey", type: "wallet" }, type: "Signature" },
						},
					},
				],
				outputs: [{ amount_sat: "cov_in.amount_sat - fee", destination: "wallet", id: "swept" }],
				params: { pubkey: { type: "pubkey" } },
			},
		},
		protocol: "p2pk-simplicity",
		utxo_types: {
			p2pk_output: { script: { source: SOURCE_PATH, type: "simplicity" } },
		},
	};

	const sweep = () =>
		reviewManifestAction(
			request({
				action: "Sweep",
				manifest: feeAware,
				params: { pubkey: PUBKEY },
				state: oneCovenantUtxo as Record<string, unknown>,
			}),
			{ ...deps, readTxOut: readTxOut(DERIVED, "42000") },
		);

	test("pays out what the covenant holds, less what the wallet worked the fee out to be", async () => {
		const result = await sweep();

		expect(isRefusal(result)).toBe(false);

		if (!isRefusal(result)) {
			expect(result.outputs[0]?.sats).toBe(42_000n - result.estimatedFeeSats);
		}
	});

	test("the fee it used is the one its own shape costs at the rate it read", async () => {
		const result = await sweep();

		if (!isRefusal(result)) {
			// One covenant input, one output, and the wallet input the estimate assumes.
			expect(result.estimatedFeeSats).toBe(
				estimateFeeSats(
					{ covenantInputs: 1, outputs: 1, walletInputs: 1 },
					result.feeRateSatsPerKvb,
				),
			);
		}
	});

	test("carries the witness the covenant needs a signature for", async () => {
		const result = await sweep();

		if (!isRefusal(result)) {
			expect(result.covenantInputs[0]?.signatureWitness).toBe("SIGNATURE");
		}
	});
});

// AC-06 and AC-07 at the seam. What the person is shown is built where what the wallet
// established is known, so nothing downstream has to guess which values were the site's word.
describe("what the person is shown", () => {
	const shown = async () => {
		const result = await reviewManifestAction(request(), {
			...deps,
			readTxOut: readTxOut("unused"),
		});

		if (isRefusal(result)) {
			throw new Error(result.reason);
		}

		return result.confirmation;
	};

	// AC-06: the four wallet-established facts.
	test("names which account is acting, because the wallet chose it implicitly", async () => {
		expect((await shown()).account).toMatchObject({
			origin: "computed",
			value: "liquid:testnet account 0",
		});
	});

	test("shows what the wallet worked the fee out to be", async () => {
		const model = await shown();

		expect(model.feeSats.value > 0n).toBe(true);
		expect(model.feeSats.origin).toBe("computed");
	});

	test("shows the net effect on this wallet, as an outgoing figure", async () => {
		const [effect] = (await shown()).netEffect;

		expect(effect?.sats.value).toBeLessThan(0n);
		expect(effect?.asset.origin).toBe("computed");
	});

	test("says whether the wallet checked each covenant against the network", async () => {
		const [covenant] = (await shown()).covenants;

		expect(covenant?.verified).toMatchObject({ origin: "computed", value: false });
	});

	test("and marks a covenant it did check as checked", async () => {
		const result = await reviewManifestAction(spendRequest(oneCovenantUtxo), {
			...deps,
			readTxOut: readTxOut(DERIVED),
		});

		if (!isRefusal(result)) {
			expect(result.confirmation.covenants[0]?.verified.value).toBe(true);
			expect(result.confirmation.covenants[0]?.address.origin).toBe("verified");
		}
	});

	// AC-07: the site's text is the site's, and says so.
	test("attributes the protocol's name to the site", async () => {
		expect((await shown()).protocol.origin).toBe("site");
	});

	test("attributes the action's name to the site", async () => {
		expect((await shown()).action.origin).toBe("site");
	});

	test("attributes the protocol's own summary to the site", async () => {
		expect((await shown()).summary?.origin).toBe("site");
	});

	test("the utxo type is the protocol's own word for it, and is marked so", async () => {
		expect((await shown()).covenants[0]?.utxoType.origin).toBe("site");
	});
});
