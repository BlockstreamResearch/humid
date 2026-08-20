import { beforeAll, describe, expect, test } from "bun:test";

import { contractSource, smplx } from "./smplxWasmForTests";

/**
 * The compiler end of a covenant's extra taproot leaves.
 *
 * `tx-manifest` proves that reading a live lending protocol's published document produces exactly
 * the two leaf payloads below, from a flag it writes as a literal and a debt it writes as a typed
 * value. It holds no compiler, by design. This is the half that cannot be asserted there: that
 * those bytes reach a real compiler, build a real covenant, and that every way of getting them
 * wrong builds a different one.
 *
 * **Why a leaf cannot be guessed.** The compiler puts each payload in a storage slot and adds it
 * to the taproot tree as a hidden node hashed `sha256(tag ‖ tag ‖ payload)`, `tag =
 * sha256("TapData")`. A hidden node has no script to fail on and no witness to check: a payload
 * that is wrong in any byte, or in its order, produces a perfectly valid address for a covenant
 * nobody deployed. Nothing anywhere reports it. The wallet then compares that address against the
 * one holding the funds, finds a difference, and refuses an action that was legitimate — for a
 * reason nothing on screen can explain. So the bytes are read out of the document and checked
 * against the protocol's own two implementations of them, never inferred.
 *
 * **Nothing here was compared against a chain.** The published document records a deployed
 * scriptPubKey for its factory, which carries no extra leaves, and none for the collateral
 * covenant, which carries these two. So these addresses are reproducible rather than confirmed.
 * Confirming one needs a deployed offer whose script is readable from Liquid.
 */

const ASSET = (byte: string) => `0x${byte.repeat(32)}`;

/**
 * The compile parameters `tx-manifest`'s review builds for the active collateral covenant, from
 * this deployment's fields. Kept character for character as that review hands them over.
 */
const ACTIVE_COLLATERAL = JSON.stringify({
	BORROWER_NFT_ASSET_ID: { type: "u256", value: ASSET("b1") },
	COLLATERAL_AMOUNT: { type: "u64", value: "100000" },
	COLLATERAL_ASSET_ID: { type: "u256", value: ASSET("c1") },
	FINALIZED_LENDER_VAULT_COV_HASH: { type: "u256", value: ASSET("11") },
	FINALIZED_PROTOCOL_FEE_VAULT_COV_HASH: { type: "u256", value: ASSET("33") },
	LENDER_NFT_ASSET_ID: { type: "u256", value: ASSET("d1") },
	LENDER_VAULT_COV_HASH: { type: "u256", value: ASSET("22") },
	LOAN_EXPIRATION_TIME: { type: "u32", value: "1900000000" },
	PRINCIPAL_AMOUNT: { type: "u64", value: "50000" },
	PRINCIPAL_ASSET_ID: { type: "u256", value: ASSET("a1") },
	PRINCIPAL_INTEREST_RATE: { type: "u64", value: "500" },
	PRINCIPAL_OUTPUT_SCRIPT_HASH: { type: "u256", value: ASSET("55") },
	PROTOCOL_FEE_VAULT_COV_HASH: { type: "u256", value: ASSET("44") },
});

/** The offer is active: the flag slot is thirty-one zero bytes and a one. */
const ACTIVE = `${"00".repeat(31)}01`;

/** The debt slot: 52500 as eight big-endian bytes, right-aligned in thirty-two. */
const DEBT = `${"00".repeat(30)}cd14`;

/** The document says its contracts were built with debug symbols, and that changes the address. */
const DEBUG_SYMBOLS = true;

let lending = "";

beforeAll(async () => {
	lending = await contractSource("lending.simf");
});

function scriptPubKeyFor(leaves: string[]): string {
	const contract = new smplx.Contract(
		lending,
		ACTIVE_COLLATERAL,
		JSON.stringify(leaves),
		DEBUG_SYMBOLS,
	);
	const script = contract.scriptPubKeyHex("liquid");

	contract.free();

	return script;
}

describe("the leaves tx-manifest encodes, through the compiler that builds the address", () => {
	test("build a covenant", () => {
		expect(scriptPubKeyFor([ACTIVE, DEBT])).toMatch(/^5120[0-9a-f]{64}$/);
	});

	test("and the compiler takes them as hex, prefixed or not", () => {
		expect(scriptPubKeyFor([`0x${ACTIVE}`, `0x${DEBT}`])).toBe(scriptPubKeyFor([ACTIVE, DEBT]));
	});

	test("a payload that is not hex is refused rather than hashed as something", () => {
		expect(() => scriptPubKeyFor([ACTIVE, "not-hex"])).toThrow();
	});
});

/**
 * Every way of getting the two leaves wrong, and what each one costs.
 *
 * All of these compile. None of them fails anywhere. Each is a different covenant, which is the
 * whole argument for reading the bytes rather than inferring them.
 */
describe("the covenants a wrong leaf would have built instead", () => {
	const right = () => scriptPubKeyFor([ACTIVE, DEBT]);

	test("dropping the leaves entirely is a different covenant", () => {
		expect(scriptPubKeyFor([])).not.toBe(right());
	});

	test("declaration order is part of the address, so swapping the two changes it", () => {
		expect(scriptPubKeyFor([DEBT, ACTIVE])).not.toBe(right());
	});

	test("the flag is one bit of one byte, and the pending offer is a different covenant", () => {
		expect(scriptPubKeyFor([`${"00".repeat(32)}`, DEBT])).not.toBe(right());
	});

	test("one satoshi of debt is a different covenant", () => {
		expect(scriptPubKeyFor([ACTIVE, `${"00".repeat(30)}cd15`])).not.toBe(right());
	});

	/** The same number, written the way this format's other byte vocabulary would write it. */
	test("and the debt written little-endian is a different covenant again", () => {
		expect(scriptPubKeyFor([ACTIVE, `14cd${"00".repeat(30)}`])).not.toBe(right());
	});

	/** Left alignment instead of right: the same eight bytes, at the other end of the slot. */
	test("as is the debt padded at the wrong end", () => {
		expect(scriptPubKeyFor([ACTIVE, `000000000000cd14${"00".repeat(24)}`])).not.toBe(right());
	});
});
