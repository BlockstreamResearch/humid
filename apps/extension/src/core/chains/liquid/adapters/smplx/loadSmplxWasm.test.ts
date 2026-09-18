import { describe, expect, test } from "bun:test";

import { smplx } from "./smplxWasmForTests";

const PROBE_SOURCE = "fn main() { assert!(jet::eq_32(witness::A, witness::B)); }";
const PROBE_CMR = "43041b02608dc3ba245a2e3dc7aa5bc991fcf6c097c6a165a18e97a486461729";

describe("smplx wasm module", () => {
	test("reports the SDK version compiled into it", () => {
		expect(smplx.sdkVersion()).toBe("0.0.11");
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
	const ASSET = "144c654344aa716d6f3abcc1ca90e5641e4e2a7f633bc09fe3baf64585819a49";
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

	test("refuses an output script that is not hex, such as an address", () => {
		const builder = new smplx.TransactionBuilder();

		expect(() => builder.addOutput("tex1p_derived", 1n, ASSET)).toThrow();
		expect(builder.outputCount()).toBe(0);
		builder.free();
	});
});

describe("a wallet input that creates an asset", () => {
	const ISSUED_FROM = "9596d259270ef5bac0020435e6d859aea633409483ba64e232b8ba04ce288668";
	const ISSUER_CONTRACT = "3c7f0a53c2ff5b99590620d7f6604a7a3a7bfbaaa6aa61f7bfc7833ca03cde82";
	const TETHER = "ce091c998b83c78bb71a632313ba3760f1763d9cfcffae02258ffa9865a37bd2";
	const TETHER_TOKEN = "59fe4d2127ba9f16bd6850a3e6271a166e7ed2e1669f6c107d655791c94ee98f";
	const TETHER_ENTROPY = "15e71351641d30019845313442452885f64bf5985d366f09a291e949fa929608";
	const NO_CONTRACT = "0".repeat(64);
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

			expect(builder.inputCount()).toBe(1);
		} finally {
			builder.free();
		}
	});

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
