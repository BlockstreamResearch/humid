import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import p2pkManifest from "../__fixtures__/p2pk.manifest.json";
import type { TxOutAtOutPoint } from "../chain/chainRead";
import { isRefusal, reviewManifestAction } from "../index";
import type { ParsedLiquidProcessCtParams } from "../request/request";

const SOURCE_PATH = "./p2pk.simf";
const SOURCE = readFileSync(new URL("../__fixtures__/p2pk.simf", import.meta.url), "utf8");
const PUBKEY = "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
const TXID = "b".repeat(64);
const MANIFEST = p2pkManifest as unknown as Record<string, unknown>;

const DERIVED = "tex1p_derived";
const DERIVED_SCRIPT = `5120${"11".repeat(32)}`;
const ELSEWHERE_SCRIPT = `5120${"22".repeat(32)}`;
const COMPILED = { address: DERIVED, scriptPubKeyHex: DERIVED_SCRIPT };

const compile = () => COMPILED;
const scriptPubKeyOf = () => DERIVED_SCRIPT;

const POLICY_ASSET = "144c654344aa716d6f3abcc1ca90e5641e4e2a7f633bc09fe3baf64585819a49";
const WALLET_SCRIPT = `0014${"33".repeat(20)}`;
const fundingUtxos = [
	{ amount: "1000000", spendable: true, txOut: "00", txid: "c".repeat(64), vout: 0 },
];
const readFeeRate = async () => 1000;

const deps = {
	accountLabel: "liquid:testnet account 0",
	compile,
	scriptPubKeyOf,
	fundingUtxos,
	network: "liquid",
	policyAsset: POLICY_ASSET,
	readFeeRate,
	walletScriptPubKeyHex: WALLET_SCRIPT,
};

const chainHolding = (scriptPubKeyHex: string) => async (): Promise<TxOutAtOutPoint> => ({
	amountSats: COVENANT_HOLDS,
	rawAssetId: POLICY_ASSET,
	scriptPubKeyHex,
	txOutHex: COVENANT_TXOUT,
});

const COVENANT_TXOUT = `01${"aa".repeat(32)}01000000000000c350000022${"00".repeat(34)}`;

const COVENANT_HOLDS = "50000";

function request(
	overrides: Partial<ParsedLiquidProcessCtParams> = {},
): ParsedLiquidProcessCtParams {
	return {
		action: "Pay",
		broadcast: false,
		contractSources: { [SOURCE_PATH]: SOURCE },
		manifest: MANIFEST,
		params: { amount_sat: 1000, pubkey: PUBKEY },
		...overrides,
	};
}

const spendRequest = (state?: unknown) =>
	request({
		action: "Receive",
		params: { pubkey: PUBKEY },
		...(state === undefined ? {} : { state: state as Record<string, unknown> }),
	});

const oneCovenantUtxo = { utxos: [{ txid: TXID, utxo_type: "p2pk_output", vout: 0 }] };

describe("reviewManifestAction", () => {
	describe("creating a covenant", () => {
		test("reports the derived covenant as not yet onchain", async () => {
			const result = await reviewManifestAction(request(), {
				...deps,
				readTxOut: chainHolding(DERIVED_SCRIPT),
			});

			expect(isRefusal(result)).toBe(false);

			if (!isRefusal(result)) {
				expect(result.action).toBe("Pay");
				expect(result.protocol).toBe("p2pk-simplicity");
				expect(result.covenants).toEqual([
					{
						address: DERIVED,
						argumentsJson: JSON.stringify({ PUB_KEY: { type: "Pubkey", value: `0x${PUBKEY}` } }),
						extraLeavesJson: "[]",
						includeDebugSymbols: false,
						role: "created",
						scriptPubKeyHex: DERIVED_SCRIPT,
						source: SOURCE,
						sourcePath: SOURCE_PATH,
						utxoType: "p2pk_output",
						verified: "not-yet-onchain",
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

					return {
						amountSats: COVENANT_HOLDS,
						rawAssetId: POLICY_ASSET,
						txOutHex: COVENANT_TXOUT,
						scriptPubKeyHex: DERIVED_SCRIPT,
					};
				},
			});

			expect(asked).toBe(0);
		});

		test("compiles against the parameters the manifest wires in", async () => {
			const seen: string[] = [];

			await reviewManifestAction(request(), {
				...deps,
				compile: (input) => {
					seen.push(input.argumentsJson);

					return COMPILED;
				},
				readTxOut: chainHolding(DERIVED_SCRIPT),
			});

			expect(seen).toEqual([JSON.stringify({ PUB_KEY: { type: "Pubkey", value: `0x${PUBKEY}` } })]);
		});
	});

	describe("spending a covenant", () => {
		test("gets past verification when the rebuilt contract locks the funds that are there", async () => {
			const result = await reviewManifestAction(spendRequest(oneCovenantUtxo), {
				...deps,
				readTxOut: chainHolding(DERIVED_SCRIPT),
			});

			expect(isRefusal(result)).toBe(false);

			if (!isRefusal(result)) {
				expect(result.covenants.map((found) => found.verified)).toEqual(["matches-chain"]);
				expect(result.outputs.find((output) => output.id === "received_out")?.sats).toBe(
					BigInt(COVENANT_HOLDS),
				);
			}
		});

		test("reads the outpoint the state file names", async () => {
			const asked: { txid: string; vout: number }[] = [];

			await reviewManifestAction(spendRequest(oneCovenantUtxo), {
				...deps,
				readTxOut: async (outpoint) => {
					asked.push(outpoint);

					return { scriptPubKeyHex: DERIVED_SCRIPT, txOutHex: COVENANT_TXOUT };
				},
			});

			expect(asked).toEqual([{ txid: TXID, vout: 0 }]);
		});

		test("refuses when the funds are locked by something else", async () => {
			const result = await reviewManifestAction(spendRequest(oneCovenantUtxo), {
				...deps,
				readTxOut: chainHolding(ELSEWHERE_SCRIPT),
			});

			expect(isRefusal(result)).toBe(true);

			if (isRefusal(result)) {
				expect(result.reason).toContain("p2pk_output");
			}
		});

		test("refuses when the state file lists no such covenant", async () => {
			const result = await reviewManifestAction(spendRequest({ utxos: [] }), {
				...deps,
				readTxOut: chainHolding(DERIVED_SCRIPT),
			});

			expect(isRefusal(result)).toBe(true);
		});

		test("refuses before reading anything when the state file is absent", async () => {
			const result = await reviewManifestAction(spendRequest(), {
				...deps,
				readTxOut: chainHolding(DERIVED_SCRIPT),
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

			if (isRefusal(result)) {
				expect(result.reason).toContain("offline");
			}
		});
	});

	test("refuses a request missing a part the action needs, naming it", async () => {
		const result = await reviewManifestAction(request({ contractSources: {} }), {
			...deps,
			readTxOut: chainHolding(DERIVED_SCRIPT),
		});

		expect(isRefusal(result)).toBe(true);

		if (isRefusal(result)) {
			expect(result.reason).toContain(SOURCE_PATH);
		}
	});

	test("refuses an action the manifest does not declare, naming it", async () => {
		const result = await reviewManifestAction(request({ action: "Withdraw" }), {
			...deps,
			readTxOut: chainHolding(DERIVED_SCRIPT),
		});

		expect(isRefusal(result)).toBe(true);

		if (isRefusal(result)) {
			expect(result.reason).toContain("Withdraw");
		}
	});

	describe("the transaction it settles", () => {
		test("pays the covenant output the script it derived, not the address it is shown as", async () => {
			const result = await reviewManifestAction(request(), {
				...deps,
				readTxOut: chainHolding(DERIVED_SCRIPT),
			});

			expect(isRefusal(result)).toBe(false);

			if (!isRefusal(result)) {
				expect(result.outputs).toEqual([
					{
						asset: POLICY_ASSET,
						blinded: false,
						decidedBy: "unblindable",
						id: "p2pk_out",
						sats: 1000n,
						scriptPubKeyHex: DERIVED_SCRIPT,
					},
				]);
			}
		});

		test("gives every output a script the builder can decode", async () => {
			const result = await reviewManifestAction(request(), {
				...deps,
				readTxOut: chainHolding(DERIVED_SCRIPT),
			});

			expect(isRefusal(result)).toBe(false);

			if (!isRefusal(result)) {
				expect(result.outputs.length).toBeGreaterThan(0);

				for (const output of result.outputs) {
					expect(output.scriptPubKeyHex).toMatch(/^(?:[0-9a-fA-F]{2})+$/);
				}
			}
		});

		test("plans no output for the change the action declares", async () => {
			const result = await reviewManifestAction(request(), {
				...deps,
				readTxOut: chainHolding(DERIVED_SCRIPT),
			});

			expect(isRefusal(result)).toBe(false);

			if (!isRefusal(result)) {
				expect(result.outputs.map((output) => output.id)).not.toContain("change_out");
			}
		});

		test("selects the wallet's own outputs to fund it, and reports the rate it will pay", async () => {
			const result = await reviewManifestAction(request(), {
				...deps,
				readTxOut: chainHolding(DERIVED_SCRIPT),
			});

			expect(isRefusal(result)).toBe(false);

			if (!isRefusal(result)) {
				expect(result.feeRateSatsPerKvb).toBe(1000);
				expect(result.selected).toEqual(fundingUtxos);
			}
		});

		test("refuses when no fee rate can be established, rather than assuming one", async () => {
			const result = await reviewManifestAction(request(), {
				...deps,
				readFeeRate: async () => {
					throw new Error("no estimate");
				},
				readTxOut: chainHolding(DERIVED_SCRIPT),
			});

			expect(isRefusal(result)).toBe(true);

			if (isRefusal(result)) {
				expect(result.reason).toContain("fee rate");
			}
		});

		test("refuses when the account cannot cover the action and its fee", async () => {
			const result = await reviewManifestAction(request(), {
				...deps,
				fundingUtxos: [
					{ amount: "10", spendable: true, txOut: "00", txid: "d".repeat(64), vout: 0 },
				],
				readTxOut: chainHolding(DERIVED_SCRIPT),
			});

			expect(isRefusal(result)).toBe(true);
		});

		test("refuses an amount this runtime does not evaluate, rather than guessing one", async () => {
			const result = await reviewManifestAction(
				request({ params: { amount_sat: "params.amount_sat - fee", pubkey: PUBKEY } }),
				{ ...deps, readTxOut: chainHolding(DERIVED_SCRIPT) },
			);

			expect(isRefusal(result)).toBe(true);
		});
	});

	test("refuses when the contract does not compile", async () => {
		const result = await reviewManifestAction(request(), {
			...deps,
			compile: () => {
				throw new Error("parse error");
			},
			readTxOut: chainHolding(DERIVED_SCRIPT),
		});

		expect(isRefusal(result)).toBe(true);

		if (isRefusal(result)) {
			expect(result.reason).toContain(SOURCE_PATH);
		}
	});
});
