import { describe, expect, test } from "bun:test";

import type { ParsedLiquidProcessCtParams } from "../request/request";
import {
	chainHolding,
	COMPILED,
	DERIVED,
	DERIVED_SCRIPT,
	ELSEWHERE_SCRIPT,
	Fixture,
	POLICY_ASSET,
	PUBKEY,
	refused,
	reviewed,
	TXID,
	utxo,
} from "./reviewForTests";

const P2PK_PATH = "./p2pk.simf";
const p2pk = Fixture.load("p2pk");

const pay = (overrides: Partial<ParsedLiquidProcessCtParams> = {}) =>
	p2pk.request("Pay", { params: { amount_sat: 1000, pubkey: PUBKEY }, ...overrides });

const receive = (overrides: Partial<ParsedLiquidProcessCtParams> = {}) =>
	p2pk.request("Receive", {
		params: { pubkey: PUBKEY },
		state: { utxos: [{ txid: TXID, utxo_type: "p2pk_output", vout: 0 }] },
		...overrides,
	});

const PUB_KEY_ARGUMENT = JSON.stringify({ PUB_KEY: { type: "Pubkey", value: `0x${PUBKEY}` } });

describe("creating a covenant", () => {
	test("reports the derived covenant as not yet onchain", async () => {
		const review = await reviewed(pay());

		expect(review.action).toBe("Pay");
		expect(review.protocol).toBe("p2pk-simplicity");
		expect(review.covenants).toEqual([
			{
				address: DERIVED,
				argumentsJson: PUB_KEY_ARGUMENT,
				cmr: "cc".repeat(32),
				extraLeavesJson: "[]",
				includeDebugSymbols: false,
				role: "created",
				scriptPubKeyHex: DERIVED_SCRIPT,
				source: p2pk.source(P2PK_PATH),
				sourcePath: P2PK_PATH,
				tapleafHash: "1e".repeat(32),
				utxoType: "p2pk_output",
				verified: "not-yet-onchain",
			},
		]);
	});

	test("never consults the chain for something that does not exist yet", async () => {
		let asked = 0;

		await reviewed(pay(), {
			readTxOut: async (outpoint) => {
				asked += 1;

				return chainHolding()(outpoint);
			},
		});

		expect(asked).toBe(0);
	});

	test("compiles against the parameters the manifest wires in", async () => {
		const seen: string[] = [];

		await reviewed(pay(), {
			compile: (input) => {
				seen.push(input.argumentsJson);

				return COMPILED;
			},
		});

		expect(seen).toEqual([PUB_KEY_ARGUMENT]);
	});
});

describe("spending a covenant", () => {
	test("gets past verification when the rebuilt contract locks the funds that are there", async () => {
		const review = await reviewed(receive());

		expect(review.covenants.map((found) => found.verified)).toEqual(["matches-chain"]);
		expect(review.outputs.find((output) => output.id === "received_out")?.sats).toBe(50_000n);
	});

	test("reads the outpoint the state file names", async () => {
		const asked: { txid: string; vout: number }[] = [];

		await reviewed(receive(), {
			readTxOut: async (outpoint) => {
				asked.push(outpoint);

				return chainHolding()(outpoint);
			},
		});

		expect(asked).toEqual([{ txid: TXID, vout: 0 }]);
	});

	test("refuses when the funds are locked by something else", async () => {
		const refusal = await refused(receive(), { readTxOut: chainHolding(ELSEWHERE_SCRIPT) });

		expect(refusal.reject).toBe("covenant-mismatch");
		expect(refusal.reason).toContain("p2pk_output");
	});

	test("refuses when the state file lists no such covenant", async () => {
		expect((await refused(receive({ state: { utxos: [] } }))).reject).toBe("no-utxo-to-spend");
	});

	test("refuses before reading anything when the state file is absent", async () => {
		expect((await refused(receive({ state: undefined }))).reject).toBe("incomplete-request");
	});

	test("refuses when the chain cannot be read, rather than proceeding unchecked", async () => {
		const refusal = await refused(receive(), {
			readTxOut: async () => {
				throw new Error("offline");
			},
		});

		expect(refusal.reject).toBe("chain-read-failed");
		expect(refusal.reason).toContain("offline");
	});
});

describe("what a request must carry", () => {
	test("refuses a request missing a part the action needs, naming the part", async () => {
		const refusal = await refused(pay({ contractSources: {} }));

		expect(refusal.reject).toBe("incomplete-request");
		expect(refusal.reason).toContain(P2PK_PATH);
	});

	test("refuses an action the manifest does not declare, naming the action", async () => {
		const refusal = await refused(pay({ action: "Withdraw" }));

		expect(refusal.reject).toBe("no-such-action");
		expect(refusal.reason).toContain("Withdraw");
	});

	test("refuses when the contract does not compile", async () => {
		const refusal = await refused(pay(), {
			compile: () => {
				throw new Error("parse error");
			},
		});

		expect(refusal.reject).toBe("document-fault");
		expect(refusal.reason).toContain(P2PK_PATH);
	});
});

describe("the transaction a review settles", () => {
	test("pays the covenant output the script it derived, not the address it is shown as", async () => {
		expect((await reviewed(pay())).outputs).toEqual([
			{
				asset: POLICY_ASSET,
				blinded: false,
				decidedBy: "unblindable",
				id: "p2pk_out",
				sats: 1000n,
				scriptPubKeyHex: DERIVED_SCRIPT,
			},
		]);
	});

	test("plans no output for the change the action declares", async () => {
		const review = await reviewed(pay());

		expect(review.outputs.map((output) => output.id)).not.toContain("change_out");
	});

	test("selects the wallet's own outputs to fund the action, and reports the rate it pays", async () => {
		const review = await reviewed(pay());

		expect(review.feeRateSatsPerKvb).toBe(1000);
		expect(review.selected).toEqual([utxo("1000000")]);
	});

	test("refuses when no fee rate can be established, rather than assuming one", async () => {
		const refusal = await refused(pay(), {
			readFeeRate: async () => {
				throw new Error("no estimate");
			},
		});

		expect(refusal.reject).toBe("no-fee-rate");
		expect(refusal.reason).toContain("fee rate");
	});

	test("refuses when the account cannot cover the action and its fee", async () => {
		expect((await refused(pay(), { fundingUtxos: [utxo("10")] })).reject).toBe("shortfall");
	});

	test("refuses an amount this runtime does not evaluate, rather than guessing one", async () => {
		const request = pay({
			params: { amount_sat: "params.amount_sat - fee", pubkey: PUBKEY },
		});

		expect((await refused(request)).reject).toBe("document-fault");
	});
});
