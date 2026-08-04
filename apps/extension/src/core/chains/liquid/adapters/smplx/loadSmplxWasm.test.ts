import { beforeAll, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

import * as smplxWasmBindings from "smplx-wasm/smplx_wasm_bg.js";

// Exercises the exact bindings `loadSmplxWasm` consumes. The only difference is where
// the module bytes come from: the extension fetches them through a Vite asset URL, this
// reads them off disk. Everything after instantiation — the `__wbg_set_wasm` handshake,
// the start call, and every exported binding — is the same code path.
//
// `loadSmplxWasm` itself cannot be imported here: it uses Vite's `?url` import, which
// only resolves under Vite.

type SmplxBindings = typeof import("smplx-wasm") & {
	__wbg_set_wasm: (exports: WebAssembly.Exports) => void;
};

const bindings = smplxWasmBindings as unknown as SmplxBindings;

// The reference value: this source compiled natively against simplicityhl 0.6.0 with
// debug symbols off. Asserting the wasm build reproduces it is what makes recomputing a
// covenant address in the wallet meaningful — a browser that derived a different CMR
// would refuse every legitimately deployed protocol.
const PROBE_SOURCE = "fn main() { assert!(jet::eq_32(witness::A, witness::B)); }";
const PROBE_CMR = "43041b02608dc3ba245a2e3dc7aa5bc991fcf6c097c6a165a18e97a486461729";

beforeAll(async () => {
	const require = createRequire(import.meta.url);
	const wasmPath = require.resolve("smplx-wasm/smplx_wasm_bg.wasm");
	const bytes = await readFile(wasmPath);

	const { instance } = await WebAssembly.instantiate(bytes, {
		"./smplx_wasm_bg.js": bindings as unknown as WebAssembly.ModuleImports,
	});

	bindings.__wbg_set_wasm(instance.exports);

	const start = instance.exports.__wbindgen_start;

	if (typeof start === "function") {
		start();
	}
});

describe("smplx wasm module", () => {
	test("reports the SDK version compiled into it", () => {
		expect(bindings.sdkVersion()).toBe("0.0.9");
	});

	test("compiles a contract to the same CMR as a native build", () => {
		const contract = new bindings.Contract(PROBE_SOURCE);

		expect(contract.commitmentMerkleRoot()).toBe(PROBE_CMR);
	});

	test("derives a covenant address", () => {
		const contract = new bindings.Contract(PROBE_SOURCE);
		const address = contract.covenantAddress("liquid-testnet");

		expect(address.startsWith("tex1p")).toBe(true);
	});

	test("refuses a source that does not compile", () => {
		const contract = new bindings.Contract("fn main() { this is not simplicityhl }");

		expect(() => contract.commitmentMerkleRoot()).toThrow();
	});

	test("rejects an unknown network by name", () => {
		const contract = new bindings.Contract(PROBE_SOURCE);

		expect(() => contract.covenantAddress("not-a-network")).toThrow();
	});
});

// Compile-time parameters are what make one contract source into many covenant
// addresses. The address check the wallet performs is only meaningful if different
// parameters genuinely produce different addresses, so that is asserted rather than
// assumed.
describe("contract parameters", () => {
	const P2PK_SOURCE =
		"fn main() { jet::bip_0340_verify((param::PUB_KEY, jet::sig_all_hash()), witness::SIGNATURE) }";

	const args = (pubkey: string) => JSON.stringify({ PUB_KEY: { type: "Pubkey", value: pubkey } });

	// Generator points for 1*G and 2*G, from simplicityhl's own example fixtures.
	const ALICE = "0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
	const BOB = "0xc6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5";

	test("compiles a parameterised contract", () => {
		const contract = new bindings.Contract(P2PK_SOURCE, args(ALICE));

		expect(contract.commitmentMerkleRoot()).toMatch(/^[0-9a-f]{64}$/);
	});

	test("different parameters produce different covenant addresses", () => {
		const alice = new bindings.Contract(P2PK_SOURCE, args(ALICE));
		const bob = new bindings.Contract(P2PK_SOURCE, args(BOB));

		expect(alice.covenantAddress("liquid-testnet")).not.toBe(bob.covenantAddress("liquid-testnet"));
	});

	test("the same parameters produce the same covenant address", () => {
		const first = new bindings.Contract(P2PK_SOURCE, args(ALICE));
		const second = new bindings.Contract(P2PK_SOURCE, args(ALICE));

		expect(first.covenantAddress("liquid-testnet")).toBe(second.covenantAddress("liquid-testnet"));
	});

	test("refuses malformed argument JSON when the contract is constructed", () => {
		expect(() => new bindings.Contract(P2PK_SOURCE, "{ not json")).toThrow();
	});

	test("refuses a parameterised contract given no parameters", () => {
		const contract = new bindings.Contract(P2PK_SOURCE);

		expect(() => contract.commitmentMerkleRoot()).toThrow();
	});
});

// A BIP39 test vector, not a wallet mnemonic. Its derived values are stable, which is
// what makes them assertable.
const TEST_MNEMONIC =
	"abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

describe("wallet signer", () => {
	test("derives an address for the network it was built for", () => {
		const signer = new bindings.WalletSigner(TEST_MNEMONIC, "liquid-testnet");

		expect(signer.address()).toMatch(/^tex1/);
		signer.free();
	});

	test("derives a different address on a different network from the same mnemonic", () => {
		const testnet = new bindings.WalletSigner(TEST_MNEMONIC, "liquid-testnet");
		const mainnet = new bindings.WalletSigner(TEST_MNEMONIC, "liquid");

		expect(testnet.address()).not.toBe(mainnet.address());
		testnet.free();
		mainnet.free();
	});

	test("derives the same values twice from the same mnemonic", () => {
		const first = new bindings.WalletSigner(TEST_MNEMONIC, "liquid-testnet");
		const second = new bindings.WalletSigner(TEST_MNEMONIC, "liquid-testnet");

		expect(first.schnorrPublicKey()).toBe(second.schnorrPublicKey());
		expect(first.address()).toBe(second.address());
		first.free();
		second.free();
	});

	test("exposes an x-only key of the right shape for a covenant parameter", () => {
		const signer = new bindings.WalletSigner(TEST_MNEMONIC, "liquid-testnet");

		expect(signer.schnorrPublicKey()).toMatch(/^[0-9a-f]{64}$/);
		signer.free();
	});

	// The confidential address is what a blinded output pays to; it must differ from the
	// unblinded one or blinding is not happening.
	test("the confidential address differs from the plain one", () => {
		const signer = new bindings.WalletSigner(TEST_MNEMONIC, "liquid-testnet");

		expect(signer.confidentialAddress()).not.toBe(signer.address());
		signer.free();
	});

	test("refuses an unknown network", () => {
		expect(() => new bindings.WalletSigner(TEST_MNEMONIC, "not-a-network")).toThrow();
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
		const builder = new bindings.TransactionBuilder();

		expect(builder.inputCount()).toBe(0);
		expect(builder.outputCount()).toBe(0);
		builder.free();
	});

	test("takes a wallet input as an outpoint plus the output it spends", () => {
		const builder = new bindings.TransactionBuilder();

		builder.addWalletInput(TXID, 0, TXOUT_HEX);

		expect(builder.inputCount()).toBe(1);
		builder.free();
	});

	// Amounts are u64 in the module, so they cross as BigInt rather than number — the same
	// base-unit discipline the wallet already keeps on its own side.
	test("takes an unblinded output", () => {
		const builder = new bindings.TransactionBuilder();

		builder.addOutput("0014" + "00".repeat(20), 50_000n, ASSET);

		expect(builder.outputCount()).toBe(1);
		builder.free();
	});

	test("refuses a txid that is not one", () => {
		const builder = new bindings.TransactionBuilder();

		expect(() => builder.addWalletInput("nope", 0, TXOUT_HEX)).toThrow();
		expect(builder.inputCount()).toBe(0);
		builder.free();
	});

	test("refuses an output encoding it cannot parse", () => {
		const builder = new bindings.TransactionBuilder();

		expect(() => builder.addWalletInput(TXID, 0, "abcd")).toThrow();
		builder.free();
	});

	test("refuses an asset id that is not one", () => {
		const builder = new bindings.TransactionBuilder();

		expect(() => builder.addOutput("0014" + "00".repeat(20), 1n, "not-an-asset")).toThrow();
		expect(builder.outputCount()).toBe(0);
		builder.free();
	});
});

// The whole Pay shape in one place: a wallet output funds a transaction, an output pays
// somewhere, and the module blinds, signs and finalises it. This is what the manifest
// runtime will drive; asserting it here means a break shows up as a failing test rather
// than as a transaction the network rejects.
describe("finalising a transaction", () => {
	const TXID = "1".repeat(64);
	// L-BTC on Liquid testnet, the policy asset the fee is paid in.
	const POLICY_ASSET = "144c654344aa716d6f3abcc1ca90e5641e4e2a7f633bc09fe3baf64585819a49";
	const FEE_RATE = 100;

	/** An explicit Elements output of `sats` of the policy asset, paying to `scriptHex`. */
	function encodeTxOut(sats: bigint, scriptHex: string): string {
		const assetLe = (POLICY_ASSET.match(/../g) ?? []).reverse().join("");
		const value = sats.toString(16).padStart(16, "0");
		const scriptLen = (scriptHex.length / 2).toString(16).padStart(2, "0");

		return `01${assetLe}01${value}00${scriptLen}${scriptHex}`;
	}

	function fundedBuilder(signer: InstanceType<SmplxBindings["WalletSigner"]>, sats: bigint) {
		const builder = new bindings.TransactionBuilder();

		builder.addWalletInput(TXID, 0, encodeTxOut(sats, signer.scriptPubKeyHex()));

		return builder;
	}

	test("blinds, signs and finalises, returning a transaction and its fee", () => {
		const signer = new bindings.WalletSigner(TEST_MNEMONIC, "liquid-testnet");
		const builder = fundedBuilder(signer, 100_000n);

		builder.addOutput(signer.scriptPubKeyHex(), 50_000n, POLICY_ASSET);

		const signed = signer.finalizeTransaction(builder, FEE_RATE, signer.scriptPubKeyHex());

		expect(signed.hex).toMatch(/^[0-9a-f]+$/);
		expect(signed.txid).toMatch(/^[0-9a-f]{64}$/);
		expect(signed.feeSats > 0n).toBe(true);

		signed.free();
		builder.free();
		signer.free();
	});

	test("refuses when the inputs cannot cover the outputs and the fee", () => {
		const signer = new bindings.WalletSigner(TEST_MNEMONIC, "liquid-testnet");
		const builder = fundedBuilder(signer, 1_000n);

		builder.addOutput(signer.scriptPubKeyHex(), 999_999n, POLICY_ASSET);

		expect(() => signer.finalizeTransaction(builder, FEE_RATE, signer.scriptPubKeyHex())).toThrow();

		builder.free();
		signer.free();
	});

	test("refuses a change script it cannot parse, rather than sending change nowhere", () => {
		const signer = new bindings.WalletSigner(TEST_MNEMONIC, "liquid-testnet");
		const builder = fundedBuilder(signer, 100_000n);

		builder.addOutput(signer.scriptPubKeyHex(), 50_000n, POLICY_ASSET);

		expect(() => signer.finalizeTransaction(builder, FEE_RATE, "not-hex")).toThrow();

		builder.free();
		signer.free();
	});
});
