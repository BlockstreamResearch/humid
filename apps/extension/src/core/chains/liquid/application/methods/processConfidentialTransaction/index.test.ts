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
const FUNDING_TXID = "d".repeat(64);

/**
 * An Elements transaction serialised as far as its inputs, which is what the input guard
 * reads. The substituted module builds one from what it was actually told to spend, so the
 * guard is exercised against the shape of the request rather than against a constant that
 * would agree with it whatever happened.
 */
function serialise(spends: { txid: string; vout: number }[]): string {
	const inputs = spends
		.map(({ txid, vout }) => {
			const reversed = (txid.match(/../g) ?? []).reverse().join("");
			const index = vout.toString(16).padStart(8, "0").match(/../g)!.reverse().join("");

			return `${reversed}${index}00ffffffff`;
		})
		.join("");

	return `0200000001${spends.length.toString(16).padStart(2, "0")}${inputs}`;
}

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
					txid: FUNDING_TXID,
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
	return {
		broadcastTransaction: async ({ txHex }) => {
			recorded.broadcasts.push({ txHex });

			return { txid: "f".repeat(64) };
		},
		loadSmplx: async () =>
			({
				compilerVersion: () => "0.6.0",
				Contract: class {
					covenantAddress() {
						return DERIVED;
					}
					scriptPubKeyHex() {
						return "5120aabb";
					}
				},
				TransactionBuilder: class {
					spends: { txid: string; vout: number }[] = [];
					addCovenantInput(txid: string, vout: number) {
						this.spends.push({ txid, vout });
					}
					addOutput() {}
					addWalletInput(txid: string, vout: number) {
						this.spends.push({ txid, vout });
					}
					free() {}
				},
				WalletSigner: class {
					finalizeTransaction(builder: { spends: { txid: string; vout: number }[] }) {
						return {
							feeSats: 500n,
							free: () => undefined,
							hex: serialise(builder.spends),
							txid: "e".repeat(64),
						};
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
		expect(result.transactionHex).toBe(serialise([{ txid: FUNDING_TXID, vout: 0 }]));
		expect(recorded.broadcasts).toHaveLength(0);
	});

	test("broadcasts only when the request asks, and returns the network's txid", async () => {
		const { method, recorded } = subject();

		const result = await method(params({ broadcast: true }), context());

		expect(recorded.broadcasts).toEqual([{ txHex: serialise([{ txid: FUNDING_TXID, vout: 0 }]) }]);
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

// AC-11 at the seam it actually protects: the guard reads the finished transaction's own
// bytes, so a module that spends something nobody asked for is caught even though every
// other part of the request was well formed.
describe("processLiquidConfidentialTransaction guards what it signs", () => {
	function subjectSpending(extra: { txid: string; vout: number }) {
		const recorded: Recorded = { broadcasts: [], mnemonicCalls: 0 };
		const dependency = dependencies(recorded);

		return {
			method: createProcessLiquidConfidentialTransaction({
				...dependency,
				loadSmplx: async () => {
					const module = (await dependency.loadSmplx()) as never as {
						TransactionBuilder: new () => { spends: { txid: string; vout: number }[] };
					};

					return {
						...module,
						TransactionBuilder: class extends module.TransactionBuilder {
							// Stands in for a module doing something it was not asked to.
							free() {}
							addOutput() {
								this.spends.push(extra);
							}
						},
					} as never;
				},
			}),
			recorded,
		};
	}

	test("refuses a transaction spending an input nobody asked for, naming it", async () => {
		const { method } = subjectSpending({ txid: "9".repeat(64), vout: 2 });

		await expect(method(params(), context())).rejects.toThrow(/9{64}:2/);
	});

	test("and nothing reaches the network", async () => {
		const { method, recorded } = subjectSpending({ txid: "9".repeat(64), vout: 2 });

		await expect(method(params({ broadcast: true }), context())).rejects.toThrow();
		expect(recorded.broadcasts).toHaveLength(0);
	});
});
