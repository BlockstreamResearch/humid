import { beforeAll, describe, expect, test } from "bun:test";

import { contractSource, smplx } from "./smplxWasmForTests";

/**
 * Which way round an asset id goes into a covenant, settled by running one.
 *
 * An asset id is written one way and committed the other, the same way a transaction id is.
 * Everything on this side of the wallet uses the written order — the chain reader turns each
 * one round on the way in, a document states one that way, a person reads one that way — and a
 * covenant compares against what `jet::input_amount` reports, which is the committed order.
 *
 * Getting this wrong is not an error anywhere. Both orders are thirty-two valid bytes, so both
 * compile, and both produce a real address that a wallet would then compare against the chain
 * and refuse — or, on the paying side, pay to. So it is not decided by reading: the contract is
 * built both ways here and executed against a transaction carrying the asset, and only one of
 * them runs.
 *
 * `asset_auth.simf` is the corpus's smallest contract that takes an asset id. Every asset-id
 * parameter in the corpus is used the same way it uses this one — compared against what a jet
 * reports about an input or an output — in `asset_auth_vault.simf` and `lending.simf` too.
 */

/** An asset id as everything states one, chosen so that turning it round changes it. */
const STATED = "6f0279e9ed041c3d710a9f57d0c02928416460c4b722ae3457a11eec8ef5b4d5";
const TXID = "2".repeat(64);
const AMOUNT = 7n;

/** The witness names the indices the contract checks: input 0 and output 0. */
const WITNESSES = JSON.stringify({
	INPUT_ASSET_INDEX: { type: "u32", value: "0" },
	OUTPUT_ASSET_INDEX: { type: "u32", value: "0" },
});

let source = "";

beforeAll(async () => {
	source = await contractSource("asset_auth.simf");
});

function turnRound(hex: string): string {
	return (hex.match(/../g) ?? []).toReversed().join("");
}

function argumentsWith(assetHex: string): string {
	return JSON.stringify({
		ASSET_AMOUNT: { type: "u64", value: String(AMOUNT) },
		ASSET_ID: { type: "u256", value: `0x${assetHex}` },
		WITH_ASSET_BURN: { type: "bool", value: "false" },
	});
}

/**
 * The covenant's own output, serialised the way a transaction carries one.
 *
 * The asset is written committed-order here because that is what a transaction holds; the
 * builder is separately given the stated order for the output it makes, so the two ends of the
 * check are constructed independently and can only agree by being right.
 */
function txOut(scriptPubKeyHex: string): string {
	const value = AMOUNT.toString(16).padStart(16, "0");
	const length = (scriptPubKeyHex.length / 2).toString(16).padStart(2, "0");

	return `01${turnRound(STATED)}01${value}00${length}${scriptPubKeyHex}`;
}

/** Builds the covenant with the given asset bytes and runs it against a transaction. */
function outcomeOf(assetHex: string): { address: string; ran: boolean } {
	const argumentsJson = argumentsWith(assetHex);
	const contract = new smplx.Contract(source, argumentsJson, "[]", false);
	const scriptPubKeyHex = contract.scriptPubKeyHex("liquid-testnet");
	const address = contract.contractAddress("liquid-testnet");
	const builder = new smplx.TransactionBuilder();

	try {
		builder.addContractInput(TXID, 0, txOut(scriptPubKeyHex), source, argumentsJson, WITNESSES);
		builder.addOutput(scriptPubKeyHex, AMOUNT, STATED);
		builder.dryRunContractInput(0, "liquid-testnet");

		return { address, ran: true };
	} catch {
		return { address, ran: false };
	} finally {
		builder.free();
		contract.free();
	}
}

describe("an asset id compiled into a covenant", () => {
	test("executes when it is the committed order", () => {
		expect(outcomeOf(turnRound(STATED)).ran).toBe(true);
	});

	test("and does not when it is the order the document states it in", () => {
		expect(outcomeOf(STATED).ran).toBe(false);
	});

	/**
	 * The reason this is decided by running rather than by reading: the wrong one is not a
	 * failure to compile or a failure to derive. It is a different covenant, at a real address,
	 * that nothing reports until money is already there.
	 */
	test("and the wrong order still produces a perfectly good address", () => {
		const wrong = outcomeOf(STATED);
		const right = outcomeOf(turnRound(STATED));

		expect(wrong.address).toMatch(/^tex1p/);
		expect(right.address).toMatch(/^tex1p/);
		expect(wrong.address).not.toBe(right.address);
	});
});
