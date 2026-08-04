import { describe, expect, test } from "bun:test";

import groupedManifest from "../../../domain/manifest/__fixtures__/p2pk-grouped.manifest.json";
import p2pkManifest from "../../../domain/manifest/__fixtures__/p2pk.manifest.json";
import {
	createProcessLiquidConfidentialTransaction,
	type LiquidProcessCtContext,
	type LiquidProcessCtDependencies,
} from "./index";

// Drives the whole seam — parse, verify, plan, sign, broadcast — with substituted
// dependencies. What is asserted is the method's own behaviour: what it refuses, what it
// asks the chain, what it signs, and when it broadcasts.

const PUBKEY = "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
const SOURCE_PATH = "./p2pk.simf";
const SOURCE = "fn main() { }";
const DERIVED = "tex1p_derived";
const WALLET_ADDRESS = "tex1q_wallet";
const WALLET_SCRIPT = "0014" + "11".repeat(20);
const POLICY_ASSET = "144c654344aa716d6f3abcc1ca90e5641e4e2a7f633bc09fe3baf64585819a49";

function params(overrides: Record<string, unknown> = {}) {
	return {
		action: "Pay",
		contractSources: { [SOURCE_PATH]: SOURCE },
		manifest: p2pkManifest,
		params: { amount_sat: 50_000, pubkey: PUBKEY },
		...overrides,
	};
}

/** A context with just enough of the wallet for this method to run. */
function context(): LiquidProcessCtContext {
	return {
		authorization: { isGranted: () => true },
		chain: {
			id: "liquid:testnet",
			settings: { backend: { url: "https://esplora.example" }, network: "testnet" },
		},
		keyManagerState: {},
		walletBackend: {
			getReceiveAddress: () => ({ address: WALLET_ADDRESS, index: 0 }),
			getUtxos: () => [
				{
					amount: "1000000",
					spendable: true,
					txid: "d".repeat(64),
					txOut: "00",
					vout: 0,
				},
			],
			syncAccount: async () => undefined,
		},
	} as unknown as LiquidProcessCtContext;
}

type Recorded = { broadcasts: { txHex: string }[]; mnemonicCalls: number };

function dependencies(recorded: Recorded): LiquidProcessCtDependencies {
	const signed = {
		feeSats: 500n,
		free: () => undefined,
		hex: "02000000deadbeef",
		txid: "e".repeat(64),
	};

	return {
		broadcastTransaction: async ({ txHex }) => {
			recorded.broadcasts.push({ txHex });

			return { txid: "f".repeat(64) };
		},
		loadSmplx: async () =>
			({
				Contract: class {
					covenantAddress() {
						return DERIVED;
					}
				},
				TransactionBuilder: class {
					addCovenantInput() {}
					addOutput() {}
					addWalletInput() {}
					free() {}
				},
				WalletSigner: class {
					finalizeTransaction() {
						return signed;
					}
					free() {}
					scriptPubKeyHex() {
						return WALLET_SCRIPT;
					}
				},
			}) as never,
		readFeeRate: () => async () => 1000,
		readTxOut: () => async () => ({
			amountSats: "42000",
			rawAssetId: POLICY_ASSET,
			scriptPubKeyAddress: DERIVED,
			scriptPubKeyHex: "5120aabb",
		}),
		resolveAccount: async () =>
			({ accountGroupIndex: 0, chain: {}, rawPolicyAssetId: POLICY_ASSET }) as never,
		scriptPubKeyHexOf: async () => WALLET_SCRIPT,
		withMnemonic: async (_request, use) => {
			recorded.mnemonicCalls += 1;

			return use("a test mnemonic");
		},
	};
}

function subject() {
	const recorded: Recorded = { broadcasts: [], mnemonicCalls: 0 };

	return { method: createProcessLiquidConfidentialTransaction(dependencies(recorded)), recorded };
}

describe("processLiquidConfidentialTransaction", () => {
	test("builds and signs, returning the transaction unsent by default", async () => {
		const { method, recorded } = subject();

		const result = await method(params(), context());

		expect(result).toMatchObject({ broadcast: false, feeSats: "500" });
		expect(result.transactionHex).toBe("02000000deadbeef");
		expect(recorded.broadcasts).toHaveLength(0);
	});

	test("broadcasts only when the request asks, and returns the network's txid", async () => {
		const { method, recorded } = subject();

		const result = await method(params({ broadcast: true }), context());

		expect(recorded.broadcasts).toEqual([{ txHex: "02000000deadbeef" }]);
		expect(result).toMatchObject({ broadcast: true, txid: "f".repeat(64) });
	});

	// The account secret is reached once, for the signing step, and not before.
	test("reads the account mnemonic exactly once", async () => {
		const { method, recorded } = subject();

		await method(params(), context());

		expect(recorded.mnemonicCalls).toBe(1);
	});

	test("refuses a request missing the contract source, naming it", async () => {
		const { method, recorded } = subject();

		await expect(method(params({ contractSources: {} }), context())).rejects.toThrow(/p2pk\.simf/);
		expect(recorded.mnemonicCalls).toBe(0);
	});

	test("refuses a malformed request before reaching the wallet at all", async () => {
		const { method, recorded } = subject();

		await expect(method({ action: "Pay" }, context())).rejects.toThrow();
		expect(recorded.mnemonicCalls).toBe(0);
	});

	test("refuses an action the manifest does not declare", async () => {
		const { method } = subject();

		await expect(method(params({ action: "Withdraw" }), context())).rejects.toThrow(/Withdraw/);
	});
});

// AC-10 end to end: the same protocol written in the grouped shape with the older
// top-level spelling goes through the whole method and produces the same transaction.
describe("processLiquidConfidentialTransaction across declaration shapes", () => {
	test("builds and signs a grouped manifest exactly as it does a flat one", async () => {
		const flat = await subject().method(params(), context());
		const grouped = await subject().method(params({ manifest: groupedManifest }), context());

		expect(grouped).toEqual(flat);
	});

	test("finds a method declared inside a class by its own name", async () => {
		const { method, recorded } = subject();

		await method(
			params({
				action: "Receive",
				manifest: groupedManifest,
				params: { pubkey: PUBKEY },
				state: { utxos: [{ txid: "a".repeat(64), utxo_type: "p2pk_output", vout: 0 }] },
			}),
			context(),
		);

		expect(recorded.mnemonicCalls).toBe(1);
	});
});
