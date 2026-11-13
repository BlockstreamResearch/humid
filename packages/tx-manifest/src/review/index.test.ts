import { describe, expect, test } from "bun:test";

import { computed, fromDapp } from "../confirmation/provenance";
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
	WALLET_SCRIPT,
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

describe("creating a program", () => {
	test("reports the derived program as not yet onchain", async () => {
		const review = await reviewed(pay());

		expect(review.action).toBe("Pay");
		expect(review.protocol).toBe("p2pk-simplicity");
		expect(review.programs).toEqual([
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
				witnessTypes: { SIGNATURE: "u32" },
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

describe("spending a program", () => {
	test("gets past verification when the rebuilt contract locks the funds that are there", async () => {
		const review = await reviewed(receive());

		expect(review.programs.map((found) => found.verified)).toEqual(["matches-chain"]);
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

		expect(refusal.reject).toBe("program-mismatch");
		expect(refusal.reason).toContain("p2pk_output");
	});

	test("refuses when the state file lists no such program", async () => {
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
	test("pays the program output the script it derived, not the address it is shown as", async () => {
		expect((await reviewed(pay())).outputs[0]).toEqual({
			asset: POLICY_ASSET,
			blinded: false,
			decidedBy: "unblindable",
			id: "p2pk_out",
			sats: 1000n,
			scriptPubKeyHex: DERIVED_SCRIPT,
		});
	});

	test("returns what is left after the fee through the change output the action declares", async () => {
		const review = await reviewed(pay());

		expect(review.outputs[1]).toMatchObject({
			id: "change_out",
			sats: 1_000_000n - 1000n - review.estimatedFeeSats,
			scriptPubKeyHex: WALLET_SCRIPT,
		});
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

describe("where an output can pay", () => {
	const KEY = `02${"55".repeat(32)}`;
	const CONFIDENTIAL = "tlq1_confidential";
	const OPEN = "tex1_open";
	const THEIRS = `0014${"44".repeat(20)}`;
	const readAddress = (address: string) => {
		if (address === CONFIDENTIAL) {
			return { blindingPublicKeyHex: KEY, scriptPubKeyHex: THEIRS };
		}

		if (address === OPEN) {
			return { scriptPubKeyHex: THEIRS };
		}

		throw new Error("not an address");
	};

	const paying = (output: Record<string, unknown>, params: Record<string, unknown> = {}) =>
		p2pk
			.editedAction("Pay", (action) => {
				action.outputs = [
					{ amount_sat: 1000, id: "paid_out", ...output },
					...(action.outputs as unknown[]),
				];
			})
			.request("Pay", { params: { amount_sat: 1000, pubkey: PUBKEY, ...params } });

	const paidOut = async (output: Record<string, unknown>, params?: Record<string, unknown>) =>
		(await reviewed(paying(output, params), { readAddress })).outputs.find(
			(planned) => planned.id === "paid_out",
		);

	test("a confidential address, blinded with the key the address carries", async () => {
		expect(await paidOut({ destination: CONFIDENTIAL })).toMatchObject({
			blinded: true,
			blindingPublicKeyHex: KEY,
			scriptPubKeyHex: THEIRS,
		});
	});

	test("and lists each address paid on the confirmation, as the dapp's word", async () => {
		const review = await reviewed(paying({ destination: CONFIDENTIAL }), { readAddress });

		expect(review.confirmation.payments).toEqual([
			{
				address: fromDapp(CONFIDENTIAL),
				asset: computed(POLICY_ASSET),
				sats: computed(1000n),
			},
		]);
	});

	test("an address a parameter names, in the open where the address carries no key", async () => {
		expect(await paidOut({ destination: "params.receiver" }, { receiver: OPEN })).toMatchObject({
			blinded: false,
			decidedBy: "unblindable",
			scriptPubKeyHex: THEIRS,
		});
	});

	test("a confidential address in the open, where the protocol asks for an amount it can read", async () => {
		const paid = await paidOut({ confidential: false, destination: CONFIDENTIAL });

		expect(paid?.blinded).toBe(false);
		expect(paid?.blindingPublicKeyHex).toBeUndefined();
	});

	test("but no address that carries no key, where the protocol asks for the output to be blinded", async () => {
		const refusal = await refused(paying({ confidential: true, destination: OPEN }), {
			readAddress,
		});

		expect(refusal.reason).toContain(OPEN);
	});

	test("nor something that is not an address on this network", async () => {
		const refusal = await refused(paying({ destination: "nowhere" }), { readAddress });

		expect(refusal.reject).toBe("document-fault");
		expect(refusal.reason).toContain("nowhere");
	});

	test("a blinded output, with the factors the protocol chose", async () => {
		expect(await paidOut({ blinding: { asset_bf: "3" }, destination: CONFIDENTIAL })).toMatchObject(
			{ assetBlindingFactor: `03${"00".repeat(31)}`, blinded: true },
		);
	});

	test("but no chosen factors on an output that is not blinded", async () => {
		const refusal = await refused(
			paying({ blinding: { asset_bf: "3" }, confidential: false, destination: CONFIDENTIAL }),
			{ readAddress },
		);

		expect(refusal.reason).toContain("not blinded");
	});

	test("a script hash, as the taproot output it names", async () => {
		expect(await paidOut({ destination: { script_hash: "ab".repeat(32) } })).toMatchObject({
			blinded: false,
			scriptPubKeyHex: `5120${"ab".repeat(32)}`,
		});
	});

	test("a burn, which no one can spend", async () => {
		expect((await paidOut({ destination: { type: "burn" } }))?.scriptPubKeyHex).toBe("6a");
	});

	test("and nowhere at all for the fee leg, which the network takes without an output", async () => {
		expect(await paidOut({ destination: { type: "fee" } })).toBeUndefined();
	});
});
