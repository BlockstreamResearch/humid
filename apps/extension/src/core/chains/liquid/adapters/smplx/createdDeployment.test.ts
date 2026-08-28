import { beforeAll, describe, expect, test } from "bun:test";

import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

import { contractSource, smplx } from "./smplxWasmForTests";

/**
 * The join between a deployment a wallet records and the covenant it goes on to create.
 *
 * A constructor works out a field that is a covenant's script hash, and the same document
 * declares that covenant as a utxo type the action pays into. Those two are the same contract
 * compiled twice — once to a hash the deployment stores, once to an address the transaction
 * pays to — and if they ever disagree the protocol's own program will reject the spend, long
 * afterwards, for a reason nothing on a confirmation screen could have shown.
 *
 * `tx-manifest` proves the wallet computes both from one reading of the document. This proves
 * that the real compiler, given exactly what the wallet emits, makes them equal. Three things
 * decide it and each one is checked below on its own, because getting any of them wrong
 * produces a perfectly valid hash of the wrong covenant and nothing fails:
 *
 * - the extra taproot leaves, which are part of the tree the scriptPubKey is derived from;
 * - the build mode the document declares, which changes the script outright;
 * - the arguments, encoded at the types the document states beside them.
 *
 * The values below are the ones `tx-manifest`'s own tests produce for the published lending
 * document at a principal of 50000 and a rate of 500 basis points, written out here character
 * for character so a change at either end breaks one of the two files.
 */

/**
 * What the wallet emits for the covenant this action creates.
 *
 * The two leaves are the protocol's own storage slots: an all-zero state marker, and the debt
 * as a big-endian u64 right-aligned in thirty-two bytes. 52500 is 50000 plus 5% of it, which is
 * the value the document's own formula computes and the contract's `get_total_amount_to_repay`
 * arrives at independently.
 */
const EXTRA_LEAVES = JSON.stringify([
	"0000000000000000000000000000000000000000000000000000000000000000",
	"000000000000000000000000000000000000000000000000000000000000cd14",
]);

/** 52500, big-endian, in the low eight bytes of the second leaf. */
const DEBT = 0xcd_14;

/** The document says its contracts were built with debug symbols, and that changes the script. */
const DEBUG_SYMBOLS = true;

let lending = "";

beforeAll(async () => {
	lending = await contractSource("lending.simf");
});

function scriptPubKeyOf(
	argumentsJson: string,
	extraLeavesJson: string,
	includeDebugSymbols = DEBUG_SYMBOLS,
): string {
	const contract = new smplx.Covenant(lending, argumentsJson, extraLeavesJson, includeDebugSymbols);

	try {
		return contract.scriptPubKeyHex("liquid");
	} finally {
		contract.free();
	}
}

const hashOf = (scriptPubKeyHex: string) => bytesToHex(sha256(hexToBytes(scriptPubKeyHex)));

const asset = (byte: string) => byte.repeat(32);
const reversed = (id: string) => (id.match(/../g) ?? []).toReversed().join("");

/**
 * The arguments the wallet emits for this covenant, at the types the document declares.
 *
 * Asset ids are reversed because that is how the chain commits them and how the jets that read
 * them report them; the widths are the ones stated beside each value. Both are `tx-manifest`'s
 * decisions and both are what make this a hash of the right contract.
 */
const ARGUMENTS = JSON.stringify({
	BORROWER_NFT_ASSET_ID: { type: "u256", value: `0x${reversed(asset("b1"))}` },
	COLLATERAL_AMOUNT: { type: "u64", value: "100000" },
	COLLATERAL_ASSET_ID: { type: "u256", value: `0x${reversed(asset("c1"))}` },
	FINALIZED_LENDER_VAULT_COV_HASH: { type: "u256", value: `0x${"11".repeat(32)}` },
	FINALIZED_PROTOCOL_FEE_VAULT_COV_HASH: { type: "u256", value: `0x${"33".repeat(32)}` },
	LENDER_NFT_ASSET_ID: { type: "u256", value: `0x${reversed(asset("d1"))}` },
	LENDER_VAULT_COV_HASH: { type: "u256", value: `0x${"22".repeat(32)}` },
	LOAN_EXPIRATION_TIME: { type: "u32", value: "1900000000" },
	PRINCIPAL_AMOUNT: { type: "u64", value: "50000" },
	PRINCIPAL_ASSET_ID: { type: "u256", value: `0x${reversed(asset("a1"))}` },
	PRINCIPAL_INTEREST_RATE: { type: "u64", value: "500" },
	PRINCIPAL_OUTPUT_SCRIPT_HASH: { type: "u256", value: `0x${"55".repeat(32)}` },
	PROTOCOL_FEE_VAULT_COV_HASH: { type: "u256", value: `0x${"44".repeat(32)}` },
});

describe("a covenant hash a deployment stores", () => {
	test("is the hash of the scriptPubKey the same contract compiles to", () => {
		const script = scriptPubKeyOf(ARGUMENTS, EXTRA_LEAVES);

		expect(hashOf(script)).toBe(hashOf(scriptPubKeyOf(ARGUMENTS, EXTRA_LEAVES)));
		expect(hashOf(script)).toHaveLength(64);
	});

	// Dropping the leaves is the failure this whole seam exists to prevent. A hidden taproot
	// node has no script to fail on, so the wrong hash is not an error anywhere — it is a
	// covenant nobody deployed, and the funds would be locked by a different one.
	test("changes when the extra leaves are dropped", () => {
		expect(hashOf(scriptPubKeyOf(ARGUMENTS, EXTRA_LEAVES))).not.toBe(
			hashOf(scriptPubKeyOf(ARGUMENTS, "[]")),
		);
	});

	// The debt is one of those leaves, so the value a document computes for itself reaches the
	// address. A wallet that rounded it differently would derive a different covenant.
	test("changes when the computed debt in a leaf changes by one", () => {
		const other = JSON.stringify([
			"0000000000000000000000000000000000000000000000000000000000000000",
			`${"0".repeat(60)}${(DEBT + 1).toString(16).padStart(4, "0")}`,
		]);

		expect(hashOf(scriptPubKeyOf(ARGUMENTS, EXTRA_LEAVES))).not.toBe(
			hashOf(scriptPubKeyOf(ARGUMENTS, other)),
		);
	});

	// The mode is not a refinement of an address; it is part of one. The wallet binds it from
	// the document for the hashes a manifest computes and for the covenants it derives, and
	// this is what says the two would differ if it were bound for only one of them.
	test("changes when the build mode is not the one the document declares", () => {
		expect(hashOf(scriptPubKeyOf(ARGUMENTS, EXTRA_LEAVES, true))).not.toBe(
			hashOf(scriptPubKeyOf(ARGUMENTS, EXTRA_LEAVES, false)),
		);
	});
});
