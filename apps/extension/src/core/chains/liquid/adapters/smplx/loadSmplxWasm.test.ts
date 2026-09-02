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
