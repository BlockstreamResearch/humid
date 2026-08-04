import { beforeAll, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

import * as smplxWasmBindings from "smplx-wasm/smplx_wasm_bg.js";

import { guardSpentInputs } from "../../domain/manifest/inputGuard";
import { spentInputs } from "../../domain/manifest/spentInputs";

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

// A covenant input is an output locked by a Simplicity program. The dry-run is what tells
// the wallet the program actually runs against this transaction before anyone approves it.
describe("covenant inputs and the dry-run", () => {
	const TXID = "2".repeat(64);
	const POLICY_ASSET = "144c654344aa716d6f3abcc1ca90e5641e4e2a7f633bc09fe3baf64585819a49";
	const P2PK_SOURCE =
		"fn main() { jet::bip_0340_verify((param::PUB_KEY, jet::sig_all_hash()), witness::SIGNATURE) }";
	const ALICE = "0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
	const ARGS = JSON.stringify({ PUB_KEY: { type: "Pubkey", value: ALICE } });

	/** The covenant's own output, so the program is spending exactly what it locks. */
	function covenantTxOut(sats: bigint): string {
		const contract = new bindings.Contract(P2PK_SOURCE, ARGS);
		const script = contract.scriptPubKeyHex("liquid-testnet");
		const assetLe = (POLICY_ASSET.match(/../g) ?? []).reverse().join("");
		const value = sats.toString(16).padStart(16, "0");
		const scriptLen = (script.length / 2).toString(16).padStart(2, "0");

		return `01${assetLe}01${value}00${scriptLen}${script}`;
	}

	test("takes a covenant input", () => {
		const builder = new bindings.TransactionBuilder();

		builder.addCovenantInput(TXID, 0, covenantTxOut(100_000n), P2PK_SOURCE, ARGS);

		expect(builder.inputCount()).toBe(1);
		builder.free();
	});

	test("refuses a witness set it cannot parse", () => {
		const builder = new bindings.TransactionBuilder();

		expect(() =>
			builder.addCovenantInput(TXID, 0, covenantTxOut(1n), P2PK_SOURCE, ARGS, "{ not json"),
		).toThrow();
		expect(builder.inputCount()).toBe(0);
		builder.free();
	});

	// The decisive question for a pre-approval dry-run: does a signature-checking covenant
	// execute when its signature witness has not been produced yet?
	test("records what a zero-witness dry-run of a signature covenant actually does", () => {
		const builder = new bindings.TransactionBuilder();
		const contract = new bindings.Contract(P2PK_SOURCE, ARGS);

		builder.addCovenantInput(TXID, 0, covenantTxOut(100_000n), P2PK_SOURCE, ARGS);
		builder.addOutput(contract.scriptPubKeyHex("liquid-testnet"), 90_000n, POLICY_ASSET);

		let outcome = "ran";

		try {
			builder.dryRunCovenantInput(0, "liquid-testnet");
		} catch (error) {
			outcome = String(error);
		}

		// Asserting the observed behaviour rather than a hoped-for one: a program that
		// asserts a signature cannot pass before the signature exists.
		expect(outcome).not.toBe("ran");

		builder.free();
	});

	test("refuses to dry-run an input that is not a covenant", () => {
		const signer = new bindings.WalletSigner(TEST_MNEMONIC, "liquid-testnet");
		const builder = new bindings.TransactionBuilder();
		const assetLe = (POLICY_ASSET.match(/../g) ?? []).reverse().join("");
		const walletTxOut = `01${assetLe}0100000000000186a000${"16"}${signer.scriptPubKeyHex()}`;

		builder.addWalletInput(TXID, 0, walletTxOut);

		expect(() => builder.dryRunCovenantInput(0, "liquid-testnet")).toThrow();

		builder.free();
		signer.free();
	});

	test("refuses to dry-run an input that does not exist", () => {
		const builder = new bindings.TransactionBuilder();

		expect(() => builder.dryRunCovenantInput(4, "liquid-testnet")).toThrow();
		builder.free();
	});
});

// Spending a covenant that authenticates whoever spends it needs a signature over the
// transaction being built, which only the signer can make. Naming the witness is how it is
// asked for; without that name the spend fails at signing with "missing witness", which is
// what this wallet did until it was measured.
describe("signing a covenant that authenticates its spender", () => {
	const TXID = "3".repeat(64);
	const POLICY_ASSET = "144c654344aa716d6f3abcc1ca90e5641e4e2a7f633bc09fe3baf64585819a49";
	const P2PK_SOURCE =
		"fn main() { jet::bip_0340_verify((param::PUB_KEY, jet::sig_all_hash()), witness::SIGNATURE) }";
	const RATE = 1000;

	function txOut(sats: bigint, scriptHex: string): string {
		const assetLe = (POLICY_ASSET.match(/../g) ?? []).reverse().join("");
		const value = sats.toString(16).padStart(16, "0");
		const len = (scriptHex.length / 2).toString(16).padStart(2, "0");

		return `01${assetLe}01${value}00${len}${scriptHex}`;
	}

	/** A transaction of the given shape, signed, returning the fee it was charged. */
	function feeFor(walletInputs: number, covenantInputs: number, outputs: number, name?: string) {
		const signer = new bindings.WalletSigner(TEST_MNEMONIC, "liquid-testnet");
		const builder = new bindings.TransactionBuilder();
		const args = JSON.stringify({
			PUB_KEY: { type: "Pubkey", value: `0x${signer.schnorrPublicKey()}` },
		});
		const covenantScript = new bindings.Contract(P2PK_SOURCE, args).scriptPubKeyHex(
			"liquid-testnet",
		);

		try {
			for (let i = 0; i < covenantInputs; i += 1) {
				builder.addCovenantInput(
					TXID,
					i,
					txOut(200_000n, covenantScript),
					P2PK_SOURCE,
					args,
					undefined,
					name,
				);
			}

			for (let i = 0; i < walletInputs; i += 1) {
				builder.addWalletInput(TXID, 50 + i, txOut(200_000n, signer.scriptPubKeyHex()));
			}

			for (let i = 0; i < outputs; i += 1) {
				builder.addOutput(signer.scriptPubKeyHex(), 10_000n, POLICY_ASSET);
			}

			const signed = signer.finalizeTransaction(builder, RATE, signer.scriptPubKeyHex());
			const fee = signed.feeSats;

			signed.free();

			return fee;
		} finally {
			builder.free();
			signer.free();
		}
	}

	test("signs the covenant when the witness needing a signature is named", () => {
		expect(feeFor(1, 1, 1, "SIGNATURE") > 0n).toBe(true);
	});

	// The regression: this is exactly what the wallet did before the witness was named.
	test("fails to satisfy the program when it is not", () => {
		expect(() => feeFor(1, 1, 1)).toThrow(/missing witness for SIGNATURE/);
	});

	// At a rate of 1000 sat/kvb the fee in satoshis is the vsize, so these are sizes. They
	// are what a fee estimate has to be built from, and a toolchain change that moves them
	// moves every fee with them — which is why they are asserted rather than noted.
	describe("what a transaction of each shape weighs", () => {
		test("one wallet input and one output, plus the change and fee smplx adds", () => {
			expect(feeFor(1, 0, 1)).toBe(257n);
		});

		test("a further wallet input costs 69", () => {
			expect(feeFor(2, 0, 1) - feeFor(1, 0, 1)).toBe(69n);
		});

		test("a further output costs 67", () => {
			expect(feeFor(1, 0, 2) - feeFor(1, 0, 1)).toBe(67n);
		});

		// A covenant input's witness is the Simplicity witness, so its size belongs to the
		// program rather than to the shape. This is p2pk's, the smallest real one there is.
		test("a p2pk covenant input costs 87, and a second 86", () => {
			expect(feeFor(1, 1, 1, "SIGNATURE") - feeFor(1, 0, 1)).toBe(87n);
			expect(feeFor(1, 2, 1, "SIGNATURE") - feeFor(1, 1, 1, "SIGNATURE")).toBe(86n);
		});
	});
});

// Extra taproot leaves are payloads appended to the tree beside the program's own leaf, and
// their bytes are as much a part of the covenant address as the parameters are. The shape of
// that tree is consensus-visible: the reference implementation folds it left and every
// deployed covenant address was derived that way, so a tree built any other way produces a
// well-formed address for a contract whose funds sit elsewhere.
describe("extra taproot leaves", () => {
	const SOURCE = "fn main() { assert!(jet::eq_32(witness::A, witness::B)); }";
	const LEAF = (byte: string) => `0x${byte.repeat(64)}`;

	function addressWith(...leaves: string[]) {
		const contract = new bindings.Contract(SOURCE, undefined, JSON.stringify(leaves));

		return contract.covenantAddress("liquid-testnet");
	}

	test("no extra leaves derives the address the module always derived", () => {
		expect(addressWith()).toBe("tex1phpq2t7y3236nxvudhfx7md9p0h3m9vlsskq5nec9trzcue6k979sk55dr6");
	});

	test("an extra leaf changes the address", () => {
		expect(addressWith(LEAF("11"))).not.toBe(addressWith());
	});

	test("the leaves' order is part of the address", () => {
		expect(addressWith(LEAF("11"), LEAF("22"))).not.toBe(addressWith(LEAF("22"), LEAF("11")));
	});

	test("the same leaves derive the same address twice", () => {
		expect(addressWith(LEAF("11"), LEAF("22"))).toBe(addressWith(LEAF("11"), LEAF("22")));
	});

	// The format's leaves are any length — `bytes` has no length and `pad_to` exists so a
	// value can be shorter — and the module's held them as a fixed thirty-two bytes until
	// this. A leaf of another length is a different leaf, not a padded one.
	test("a leaf shorter than thirty-two bytes is its own leaf, not a padded one", () => {
		expect(addressWith("0x0102")).not.toBe(addressWith(`0x0102${"00".repeat(30)}`));
	});

	test("a leaf longer than thirty-two bytes is accepted", () => {
		expect(addressWith(`0x${"33".repeat(64)}`)).toMatch(/^tex1p/);
	});

	test("refuses a leaf that is not hex rather than deriving something", () => {
		expect(() => addressWith("0xzz")).toThrow();
	});
});

// The input guard reads the outpoints out of a finished transaction's own bytes rather than
// asking the module what it spent — a module's account of itself cannot answer whether the
// module did something it was not asked to. That only works if the parser agrees with what
// the module actually serialises, which is what this checks.
describe("what a signed transaction says it spends", () => {
	const TXID = "4".repeat(64);
	const POLICY_ASSET = "144c654344aa716d6f3abcc1ca90e5641e4e2a7f633bc09fe3baf64585819a49";

	function txOut(sats: bigint, scriptHex: string): string {
		const assetLe = (POLICY_ASSET.match(/../g) ?? []).reverse().join("");
		const value = sats.toString(16).padStart(16, "0");
		const len = (scriptHex.length / 2).toString(16).padStart(2, "0");

		return `01${assetLe}01${value}00${len}${scriptHex}`;
	}

	function signSpending(vouts: number[]) {
		const signer = new bindings.WalletSigner(TEST_MNEMONIC, "liquid-testnet");
		const builder = new bindings.TransactionBuilder();

		try {
			for (const vout of vouts) {
				builder.addWalletInput(TXID, vout, txOut(200_000n, signer.scriptPubKeyHex()));
			}

			builder.addOutput(signer.scriptPubKeyHex(), 10_000n, POLICY_ASSET);

			const signed = signer.finalizeTransaction(builder, 1000, signer.scriptPubKeyHex());
			const hex = signed.hex;

			signed.free();

			return hex;
		} finally {
			builder.free();
			signer.free();
		}
	}

	test("the parser reads back the outpoint that went in", () => {
		const result = spentInputs(signSpending([3]));

		expect(result.ok && result.spent).toEqual([{ txid: TXID, vout: 3 }]);
	});

	test("and reads several back in the order they were added", () => {
		const result = spentInputs(signSpending([1, 5]));

		expect(result.ok && result.spent).toEqual([
			{ txid: TXID, vout: 1 },
			{ txid: TXID, vout: 5 },
		]);
	});

	test("the guard passes a transaction spending exactly what the wallet chose", () => {
		const chosen = [
			{ txid: TXID, vout: 1 },
			{ txid: TXID, vout: 5 },
		];

		expect(
			guardSpentInputs(signSpending([1, 5]), { covenantInputs: [], walletInputs: chosen }),
		).toEqual({ ok: true });
	});

	test("and refuses one spending an outpoint the wallet did not choose", () => {
		const result = guardSpentInputs(signSpending([1, 5]), {
			covenantInputs: [],
			walletInputs: [{ txid: TXID, vout: 1 }],
		});

		expect(result.ok).toBe(false);
	});
});

// Golden vectors: the exact addresses this module derives, pinned. They exist because the
// failure mode of every encoding, ordering and convergence decision in the runtime is a
// well-formed address for the wrong contract, which no test that recomputes the expectation
// alongside the value can catch. These are the compiler's own p2pk contract, authored
// upstream, so what they pin is not our own consistency with ourselves.
describe("golden covenant addresses", () => {
	// simplicityhl-0.6.0/examples/p2pk.simf, with its parameter renamed to the one the
	// published manifest uses. Two identifiers differ from upstream and nothing else.
	const UPSTREAM_P2PK =
		"fn main() { jet::bip_0340_verify((param::PUB_KEY, jet::sig_all_hash()), witness::SIGNATURE) }";
	// simplicityhl-0.6.0/examples/p2pk.args, verbatim.
	const ALICE = "0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";

	function address(input: {
		debug?: boolean;
		leaves?: string[];
		network?: string;
		pubkey?: string;
	}): string {
		const args = JSON.stringify({ PUB_KEY: { type: "Pubkey", value: input.pubkey ?? ALICE } });
		const contract = new bindings.Contract(
			UPSTREAM_P2PK,
			args,
			input.leaves ? JSON.stringify(input.leaves) : undefined,
			input.debug,
		);

		return contract.covenantAddress(input.network ?? "liquid-testnet");
	}

	test("the parameterised contract, on testnet", () => {
		expect(address({})).toBe("tex1peavhc0s5wcm0ans49jxg445enyh6uuwl8radea7expf2syt5rkzqjre6vm");
	});

	test("the same contract on mainnet is a different address, and a fixed one", () => {
		expect(address({ network: "liquid" })).toBe(
			"ex1peavhc0s5wcm0ans49jxg445enyh6uuwl8radea7expf2syt5rkzqn6taa5",
		);
	});

	// Debug symbols change the CMR and therefore the address. The wallet builds each contract
	// the way its protocol declares, so both are values a real protocol could sit at.
	test("built with debug symbols it is a different address again", () => {
		expect(address({ debug: true })).not.toBe(address({ debug: false }));
	});

	test("and that address is fixed too", () => {
		expect(address({ debug: true })).toBe(
			"tex1p8vjx8uana9z0k8670v9aqgys02we6yy0sndhjkapwhd76k2ux9vqv8rzsv",
		);
	});

	// Extra leaves are appended in declaration order, and the tree is folded left. Three of
	// them is where a balanced tree would diverge, so it is the count worth pinning.
	test("with three extra leaves, where a balanced tree would differ", () => {
		const leaves = [`0x${"11".repeat(32)}`, `0x${"22".repeat(32)}`, `0x${"33".repeat(32)}`];

		expect(address({ leaves })).toBe(
			"tex1p70jezh2969ew3w29h2hvpwtl9eh4mzyuv8srpn9rfa8t4uputp7schqmqt",
		);
	});

	test("their order is part of the address", () => {
		const forward = address({ leaves: [`0x${"11".repeat(32)}`, `0x${"22".repeat(32)}`] });
		const reversed = address({ leaves: [`0x${"22".repeat(32)}`, `0x${"11".repeat(32)}`] });

		expect(forward).not.toBe(reversed);
	});

	test("a different parameter is a different covenant", () => {
		expect(address({ pubkey: `0x${"01".repeat(32)}` })).not.toBe(address({}));
	});
});

// The deployed protocol's own contracts. These are the sources `lending`, `lending_v2` and
// `lending_v3` reference, and until they were vendored nothing could check that this wallet
// compiles what a real protocol deployed rather than only what we wrote to suit it.
describe("the simplicity-lending contracts", () => {
	const CONTRACTS = "../../domain/manifest/__fixtures__/contracts";

	async function source(name: string): Promise<string> {
		const { readFile: read } = await import("node:fs/promises");
		const { dirname, join } = await import("node:path");
		const { fileURLToPath } = await import("node:url");

		return read(join(dirname(fileURLToPath(import.meta.url)), CONTRACTS, `${name}.simf`), "utf8");
	}

	const U256 = `0x${"11".repeat(32)}`;
	const ARGUMENTS: Record<string, Record<string, { type: string; value: string }>> = {
		asset_auth: {
			ASSET_AMOUNT: { type: "u64", value: "0x0000000000000001" },
			ASSET_ID: { type: "u256", value: U256 },
			WITH_ASSET_BURN: { type: "bool", value: "true" },
		},
		asset_auth_vault: {
			FINALIZED_VAULT_COV_HASH: { type: "u256", value: U256 },
			IS_ACTIVE: { type: "bool", value: "true" },
			KEEPER_AUTH_ASSET_AMOUNT: { type: "u64", value: "0x0000000000000001" },
			KEEPER_AUTH_ASSET_ID: { type: "u256", value: U256 },
			SUPPLIER_AUTH_ASSET_ID: { type: "u256", value: U256 },
			VAULT_ASSET_ID: { type: "u256", value: U256 },
			WITH_KEEPER_ASSET_BURN: { type: "bool", value: "true" },
			WITH_SUPPLIER_ASSET_BURN: { type: "bool", value: "true" },
		},
		issuance_factory: {
			ISSUING_UTXOS_COUNT: { type: "u8", value: "0x01" },
			REISSUANCE_FLAGS: { type: "u64", value: "0x0000000000000001" },
		},
		lending: {
			BORROWER_NFT_ASSET_ID: { type: "u256", value: U256 },
			COLLATERAL_AMOUNT: { type: "u64", value: "0x0000000000000001" },
			COLLATERAL_ASSET_ID: { type: "u256", value: U256 },
			FINALIZED_LENDER_VAULT_COV_HASH: { type: "u256", value: U256 },
			FINALIZED_PROTOCOL_FEE_VAULT_COV_HASH: { type: "u256", value: U256 },
			LENDER_NFT_ASSET_ID: { type: "u256", value: U256 },
			LENDER_VAULT_COV_HASH: { type: "u256", value: U256 },
			LOAN_EXPIRATION_TIME: { type: "u32", value: "0x00000001" },
			PRINCIPAL_AMOUNT: { type: "u64", value: "0x0000000000000001" },
			PRINCIPAL_ASSET_ID: { type: "u256", value: U256 },
			PRINCIPAL_INTEREST_RATE: { type: "u64", value: "0x0000000000000001" },
			PRINCIPAL_OUTPUT_SCRIPT_HASH: { type: "u256", value: U256 },
			PROTOCOL_FEE_VAULT_COV_HASH: { type: "u256", value: U256 },
		},
		script_auth: { SCRIPT_HASH: { type: "u256", value: U256 } },
	};

	// The commitment merkle root is what the covenant address is built from, so pinning it
	// pins compilation itself: a compiler change, a parameter-encoding change or a debug-mode
	// change all move it, and each of those would otherwise move an address silently.
	const GOLDEN: Record<string, string> = {
		asset_auth: "20fd155233a87fcc910a66f0395dc511ad08c5d7a8a9d774881de5520ac0ebf1",
		asset_auth_vault: "8233cab286b79ac63ccac8f2fc67722cfb1ee9a5ca3e1d4179d09f5a9e1610de",
		issuance_factory: "f610387190b1bc269d980bb391063fae96ea123dfce9a078936a1945d8675504",
		lending: "34019215b7a6edffbf69e47d3795cc951f9962b723ecb3cf72f1f551669afe5c",
		script_auth: "9c89c4aa4a20603c4e21b073d71238c37a6285b8e17b5bf19af1c74519781c18",
	};

	for (const [name, cmr] of Object.entries(GOLDEN)) {
		test(`${name} compiles to a fixed commitment merkle root`, async () => {
			const contract = new bindings.Contract(
				await source(name),
				JSON.stringify(ARGUMENTS[name]),
				undefined,
				undefined,
			);

			expect(contract.commitmentMerkleRoot()).toBe(cmr);
		});
	}

	// lending.simf is the reason the bounded fixed point exists: four of its thirteen
	// parameters are other covenants' script hashes, two of them the finalised form of the
	// same vaults. A different hash going in is a different address coming out.
	test("lending's address follows the covenant hashes compiled into it", async () => {
		const text = await source("lending");
		const other = {
			...ARGUMENTS.lending,
			LENDER_VAULT_COV_HASH: { type: "u256", value: `0x${"22".repeat(32)}` },
		};

		expect(
			new bindings.Contract(text, JSON.stringify(other), undefined, undefined).covenantAddress(
				"liquid-testnet",
			),
		).not.toBe(
			new bindings.Contract(
				text,
				JSON.stringify(ARGUMENTS.lending),
				undefined,
				undefined,
			).covenantAddress("liquid-testnet"),
		);
	});
});
