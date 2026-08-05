import { describe, expect, test } from "bun:test";

import { txOutAt } from "@humid/tx-manifest";
import groupedManifest from "@humid/tx-manifest/fixtures/p2pk-grouped.manifest.json";
import p2pkManifest from "@humid/tx-manifest/fixtures/p2pk.manifest.json";

import {
	createProcessLiquidConfidentialTransaction,
	type LiquidProcessCtContext,
	type LiquidProcessCtDependencies,
} from "./index";
import {
	isProcessCtConfirmationData,
	type ProcessCtConfirmationData,
} from "./ProcessCtConfirmation";

// Drives the whole seam — parse, verify, plan, sign, broadcast — with substituted
// dependencies. What is asserted is the method's own behaviour: what it refuses, what it
// asks the chain, what it signs, and when it broadcasts.

const PUBKEY = "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
const SOURCE_PATH = "./p2pk.simf";
const SOURCE = "fn main() { }";
const DERIVED_SCRIPT = `5120${"aa".repeat(32)}`;

/** What the real module does with a hex argument, so a substitute cannot be laxer. */
function requireHex(what: string, value: string): void {
	if (!/^(?:[0-9a-fA-F]{2})+$/.test(value)) {
		throw new Error(`Invalid ${what}: Odd number of digits`);
	}
}

function requireTxid(txid: string): void {
	if (!/^[0-9a-fA-F]{64}$/.test(txid)) {
		throw new Error(`Invalid txid: ${txid}`);
	}
}
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

type Recorded = { broadcasts: { txHex: string }[]; mnemonicCalls: number; paid: string[] };

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
					// Held across the wasm boundary, so the method releases it. A substitute
					// without this passes only because nothing checked that it was released.
					free() {}
					scriptPubKeyHex() {
						return DERIVED_SCRIPT;
					}
				},
				// Every argument the real builder parses is parsed here too. A substitute that
				// accepts whatever it is given is how a bech32 address reached `addOutput`
				// through a green suite (DISC-138), so the rule is now the module's own: what
				// it decodes, this decodes.
				TransactionBuilder: class {
					spends: { txid: string; vout: number }[] = [];
					addCovenantInput(txid: string, vout: number, txOutHex: string) {
						requireHex("covenant input's previous output", txOutHex);
						requireTxid(txid);
						this.spends.push({ txid, vout });
					}
					addOutput(scriptPubKeyHex: string) {
						requireHex("output script", scriptPubKeyHex);
						recorded.paid.push(scriptPubKeyHex);
					}
					addWalletInput(txid: string, vout: number, txOut: string) {
						requireHex("wallet input's previous output", txOut);
						requireTxid(txid);
						this.spends.push({ txid, vout });
					}
					free() {}
				},
				WalletSigner: class {
					finalizeTransaction(
						builder: { spends: { txid: string; vout: number }[] },
						_feeRateSatsPerKvb: number,
						changeScriptPubKeyHex: string,
					) {
						requireHex("change script", changeScriptPubKeyHex);

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
		// Answers with bytes and reads them back through the same parser the real reader uses,
		// so this cannot hand over an output the chain could not have produced.
		readTxOut: () => async () => {
			const asset = `01${(POLICY_ASSET.match(/../g) ?? []).reverse().join("")}`;
			const value = `01${(42_000).toString(16).padStart(16, "0")}`;
			const script = `${(DERIVED_SCRIPT.length / 2).toString(16).padStart(2, "0")}${DERIVED_SCRIPT}`;
			const parsed = txOutAt(`02000000000001${asset}${value}00${script}00000000`, 0);

			if (!parsed.ok) {
				throw new Error(parsed.reason);
			}

			return parsed.txOut;
		},
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
	const recorded: Recorded = { broadcasts: [], mnemonicCalls: 0, paid: [] };

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
		const recorded: Recorded = { broadcasts: [], mnemonicCalls: 0, paid: [] };
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

// AC-14 and D7: a person who wipes the wallet and restores from the recovery phrase must be
// able to perform the same action. There is nothing to restore *to* — so what is shown is
// that the method is a function of the request, the phrase and the chain, and that a second
// run on a context built from nothing else reaches the same transaction.
describe("processLiquidConfidentialTransaction on a restored wallet", () => {
	test("the same request twice, on contexts sharing nothing, reaches the same transaction", async () => {
		const first = await subject().method(params(), context());
		const restored = await subject().method(params(), context());

		expect(restored).toEqual(first);
	});

	test("and reaches the same transaction whether or not one ran before it", async () => {
		const alone = await subject().method(params(), context());
		const { method } = subject();

		await method(params({ broadcast: true }), context());

		expect(await method(params(), context())).toEqual(alone);
	});

	// What it reads from the wallet is the point: the account, its own outputs and an address,
	// all of which a restored wallet derives from the phrase by scanning. Anything else would
	// be something a previous run left behind.
	test("reads nothing from the wallet a restored one could not derive", async () => {
		const read: string[] = [];
		const base = context();
		const watched = new Proxy(base, {
			get(target, property) {
				if (typeof property === "string") {
					read.push(property);
				}

				return target[property as keyof typeof target];
			},
		});

		await subject().method(params(), watched);

		expect([...new Set(read)].sort()).toEqual([
			"authorization",
			"chain",
			"keyManagerState",
			"walletBackend",
		]);
	});
});

// The confirmation screen was never driven from the method, only from data a test wrote
// by hand — so a payload that no renderer could read shipped, and a person calling the
// method got a black window that timed out into "User rejected the request" (DISC-137).
// Both halves of that are asserted here against the real payload.
describe("what the person is actually shown", () => {
	async function shownRequest() {
		let captured: { data?: unknown } | undefined;

		await subject().method(params(), {
			...context(),
			authorization: { isGranted: () => false },
			confirm: async (request: { data?: unknown }) => {
				captured = request;

				return true;
			},
		} as unknown as LiquidProcessCtContext);

		return captured;
	}

	test("the payload is one the confirmation surface recognises", async () => {
		const request = await shownRequest();

		expect(isProcessCtConfirmationData(request?.data)).toBe(true);
	});

	test("and survives the message bus, which serializes as JSON and cannot carry a bigint", async () => {
		const request = await shownRequest();

		expect(() => JSON.stringify(request?.data)).not.toThrow();
	});

	test("carrying the wallet's own figures, not the site's claims", async () => {
		const request = await shownRequest();
		const data = request?.data as ProcessCtConfirmationData;

		expect(data.shown.netEffect.length).toBeGreaterThan(0);
		// `computed` rather than `verified`: the balance change is arithmetic over chain
		// reads, and combining takes the weaker origin so the sum cannot claim more than its
		// parts. What matters on this screen is that it is not the site's word.
		expect(data.shown.netEffect[0]?.sats.origin).toBe("computed");
		expect(data.shown.protocol.origin).toBe("site");
	});
});

// The transaction builder hex-decodes every output script it is given, so a value that is
// not hex fails inside the module with "Invalid script: Odd number of digits" — an error
// that names neither the output nor what was wrong with it. A covenant output was paid to
// the bech32 address the wallet derived, because the address and the scriptPubKey were two
// spellings of one fact reached by two different calls (DISC-138).
describe("what the outputs actually pay to", () => {
	test("every output script is hex the builder can decode", async () => {
		const { method, recorded } = subject();

		await method(params(), context());

		expect(recorded.paid.length).toBeGreaterThan(0);

		for (const script of recorded.paid) {
			expect(script).toMatch(/^(?:[0-9a-fA-F]{2})+$/);
		}
	});

	test("and the covenant output pays the script, not the address it is shown as", async () => {
		const { method, recorded } = subject();

		await method(params(), context());

		expect(recorded.paid).toContain(DERIVED_SCRIPT);
		expect(recorded.paid).not.toContain(DERIVED);
	});
});
