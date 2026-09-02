import { describe, expect, test } from "bun:test";

import { smplx } from "./smplxWasmForTests";

// Exercises the exact bindings `loadSmplxWasm` consumes. The only difference is where the
// module bytes come from: the extension fetches them through a Vite asset URL, this reads
// them off disk. Everything after instantiation — the `__wbg_set_wasm` handshake, the start
// call, and every exported binding — is the same code path.
//
// `loadSmplxWasm` itself cannot be imported here: it uses Vite's `?url` import, which only
// resolves under Vite.

// The reference value: this source compiled natively against simplicityhl 0.6.0 with debug
// symbols off. Asserting the wasm build reproduces it is what makes recomputing a covenant
// address in the wallet meaningful — a browser that derived a different CMR would refuse
// every legitimately deployed protocol.
const PROBE_SOURCE = "fn main() { assert!(jet::eq_32(witness::A, witness::B)); }";
const PROBE_CMR = "43041b02608dc3ba245a2e3dc7aa5bc991fcf6c097c6a165a18e97a486461729";

describe("smplx wasm module", () => {
	test("reports the SDK version compiled into it", () => {
		expect(smplx.sdkVersion()).toBe("0.0.10");
	});

	test("compiles a covenant to the same CMR as a native build", () => {
		const covenant = new smplx.Covenant(PROBE_SOURCE);

		expect(covenant.commitmentMerkleRoot()).toBe(PROBE_CMR);
		covenant.free();
	});

	test("derives a covenant address", () => {
		const covenant = new smplx.Covenant(PROBE_SOURCE);

		expect(covenant.address("liquid-testnet").startsWith("tex1p")).toBe(true);
		covenant.free();
	});

	// The address and the script are two spellings of one fact, and only one of them is hex.
	// An output pays the script; the address is what a person is shown.
	test("reports the script an output pays, as hex, beside the address", () => {
		const covenant = new smplx.Covenant(PROBE_SOURCE);

		expect(covenant.scriptPubKeyHex("liquid-testnet")).toMatch(/^(?:[0-9a-f]{2})+$/);
		covenant.free();
	});

	test("derives a different address on a different network from the same source", () => {
		const testnet = new smplx.Covenant(PROBE_SOURCE);
		const mainnet = new smplx.Covenant(PROBE_SOURCE);

		expect(testnet.address("liquid-testnet")).not.toBe(mainnet.address("liquid"));
		testnet.free();
		mainnet.free();
	});

	// Not released afterwards, and that is the binding rather than an oversight. The failed
	// compile leaves the handle borrowed on the Rust side, so `free` here does not release it —
	// it throws "attempted to take ownership of Rust value while it was borrowed" and that is
	// the error the assertion would end up reporting, in place of the compile error this is
	// about. The completed test leaves it unfreed for the same reason.
	test("refuses a source that does not compile", () => {
		const covenant = new smplx.Covenant("fn main() { this is not simplicityhl }");

		expect(() => covenant.commitmentMerkleRoot()).toThrow();
	});

	test("rejects an unknown network by name", () => {
		const covenant = new smplx.Covenant(PROBE_SOURCE);

		expect(() => covenant.address("not-a-network")).toThrow();
		covenant.free();
	});
});

describe("transaction assembly", () => {
	const TXID = "0".repeat(64);
	// L-BTC on Liquid testnet.
	const ASSET = "144c654344aa716d6f3abcc1ca90e5641e4e2a7f633bc09fe3baf64585819a49";
	// A P2WPKH output of 100_000 sats of the asset above, consensus-encoded.
	const TXOUT_HEX =
		"01" +
		"499a818545f6bae39fc03b637f2a4e1e64e590cac1bc3a6f6d71aa4443654c14" +
		"01" +
		"00000000000186a0" +
		"00" +
		"160014" +
		"0000000000000000000000000000000000000000";

	test("starts empty", () => {
		const builder = new smplx.TransactionBuilder();

		expect(builder.inputCount()).toBe(0);
		expect(builder.outputCount()).toBe(0);
		builder.free();
	});

	test("takes a wallet input as an outpoint plus the output it spends", () => {
		const builder = new smplx.TransactionBuilder();

		builder.addWalletInput(TXID, 0, TXOUT_HEX);

		expect(builder.inputCount()).toBe(1);
		builder.free();
	});

	// Amounts are u64 in the module, so they cross as BigInt rather than number — the same
	// base-unit discipline the wallet already keeps on its own side.
	test("takes an unblinded output", () => {
		const builder = new smplx.TransactionBuilder();

		builder.addOutput(`0014${"00".repeat(20)}`, 50_000n, ASSET);

		expect(builder.outputCount()).toBe(1);
		builder.free();
	});

	test("refuses a txid that is not one", () => {
		const builder = new smplx.TransactionBuilder();

		expect(() => builder.addWalletInput("nope", 0, TXOUT_HEX)).toThrow();
		expect(builder.inputCount()).toBe(0);
		builder.free();
	});

	test("refuses an output encoding it cannot parse", () => {
		const builder = new smplx.TransactionBuilder();

		expect(() => builder.addWalletInput(TXID, 0, "abcd")).toThrow();
		expect(builder.inputCount()).toBe(0);
		builder.free();
	});

	test("refuses an asset id that is not one", () => {
		const builder = new smplx.TransactionBuilder();

		expect(() => builder.addOutput(`0014${"00".repeat(20)}`, 1n, "not-an-asset")).toThrow();
		expect(builder.outputCount()).toBe(0);
		builder.free();
	});

	// A script that is not hex fails inside the module with an error naming neither the output
	// nor what was wrong with it, which is why the review derives a script rather than passing
	// on the address it is shown as.
	test("refuses an output script that is not hex, such as an address", () => {
		const builder = new smplx.TransactionBuilder();

		expect(() => builder.addOutput("tex1p_derived", 1n, ASSET)).toThrow();
		expect(builder.outputCount()).toBe(0);
		builder.free();
	});
});

/**
 * The call that creates an asset, against the module this wallet ships.
 *
 * Everything else about issuance in this slice is checked against a substitute, which can only
 * prove that the wallet calls what it meant to call. This proves the call exists, takes these
 * arguments in this order, and hands back the three ids the wallet compares its own derivation
 * against — a substitute cannot fail when the real binding reorders two arguments.
 *
 * Credential-free: adding an input needs no signer, only finalizing does, and this stops
 * before that. Nothing is signed and nothing is broadcast.
 *
 * The expectations are one asset Liquid already carries rather than anything this repository
 * computes, so the test cannot agree with a wrong implementation by sharing it. Tether USD,
 * read on 2026-08-13 from Blockstream's Liquid Esplora `GET /liquid/api/asset/<id>`, which
 * reports its `issuance_prevout`, `contract_hash` and `reissuance_token`. That is the same
 * provenance as the vectors in `packages/tx-manifest/src/chain/issuance.test.ts`, and the two
 * arrive at it independently — one in TypeScript here, one in Rust inside the module.
 *
 * The entropy is not published by the registry. It is pinned here because it is the only value
 * that produces both of the ids that are: the asset and the token are each a hash of it, so an
 * entropy off by a byte could not reproduce either. Its spelling is the reversed one, which is
 * how the module's `sha256::Midstate` displays (`DISPLAY_BACKWARD`).
 */
describe("a wallet input that creates an asset", () => {
	const ISSUED_FROM = "9596d259270ef5bac0020435e6d859aea633409483ba64e232b8ba04ce288668";
	const ISSUER_CONTRACT = "3c7f0a53c2ff5b99590620d7f6604a7a3a7bfbaaa6aa61f7bfc7833ca03cde82";
	const TETHER = "ce091c998b83c78bb71a632313ba3760f1763d9cfcffae02258ffa9865a37bd2";
	const TETHER_TOKEN = "59fe4d2127ba9f16bd6850a3e6271a166e7ed2e1669f6c107d655791c94ee98f";
	const TETHER_ENTROPY = "15e71351641d30019845313442452885f64bf5985d366f09a291e949fa929608";
	/** No issuer contract, written out — the same statement production makes by omission. */
	const NO_CONTRACT = "0".repeat(64);
	// The same P2WPKH output of 100_000 sats used above, consensus-encoded. Which output the
	// input spends decides the asset; what is in it does not.
	const TXOUT_HEX =
		"01" +
		"499a818545f6bae39fc03b637f2a4e1e64e590cac1bc3a6f6d71aa4443654c14" +
		"01" +
		"00000000000186a0" +
		"00" +
		"160014" +
		"0000000000000000000000000000000000000000";

	test("takes the outpoint, its output and what it mints, and reports the asset Liquid holds", () => {
		const builder = new smplx.TransactionBuilder();

		try {
			const report = builder.addWalletIssuanceInput(
				ISSUED_FROM,
				0,
				TXOUT_HEX,
				1000n,
				// No reissuance token: Liquid requires one to be held confidentially, and this
				// path builds transactions whose values are all explicit.
				0n,
				ISSUER_CONTRACT,
			);

			try {
				expect(report.assetId).toBe(TETHER);
				expect(report.entropy).toBe(TETHER_ENTROPY);
				expect(report.reissuanceTokenId).toBe(TETHER_TOKEN);
			} finally {
				report.free();
			}

			// Added once, as an issuance, rather than alongside an ordinary input.
			expect(builder.inputCount()).toBe(1);
		} finally {
			builder.free();
		}
	});

	/**
	 * The shape production actually calls, which the vector above does not exercise.
	 *
	 * `assembleReviewedTransaction` passes `undefined` for the issuer contract, because a
	 * manifest declares none at any position — so the one call this wallet ever makes is the
	 * one with the optional argument omitted, and the vector above proves a different call. A
	 * binding that required the argument, or that read an omitted one as anything other than
	 * no commitment, would mint an asset under a different id than the wallet derived and
	 * showed to a person, and the disagreement would surface only at assembly.
	 *
	 * The assertion is the whole of it: `reportFor(undefined)` makes the production call
	 * against the shipped binding and must equal `reportFor(NO_CONTRACT)`, which states the
	 * same thing outright. Reaching the binding at all is what proves the argument is
	 * genuinely optional; the two reports agreeing is what proves omitting it means the empty
	 * commitment rather than something else. Both halves of the comparison come out of the
	 * module, so nothing here is derived here and nothing is shared with the implementation
	 * this repository would otherwise be checking against itself.
	 *
	 * One outpoint, and therefore a builder per call: the ids are a function of the output the
	 * input spends, so comparing two outpoints would compare the wrong thing — and one builder
	 * cannot spend one outpoint twice.
	 */
	test("reads the issuer contract production omits exactly as an all-zero one", () => {
		const reportFor = (contract: string | undefined) => {
			const builder = new smplx.TransactionBuilder();

			try {
				const report = builder.addWalletIssuanceInput(
					ISSUED_FROM,
					0,
					TXOUT_HEX,
					1000n,
					0n,
					contract,
				);

				try {
					return {
						asset: report.assetId,
						entropy: report.entropy,
						token: report.reissuanceTokenId,
					};
				} finally {
					report.free();
				}
			} finally {
				builder.free();
			}
		};

		expect(reportFor(undefined)).toEqual(reportFor(NO_CONTRACT));
	});
});
