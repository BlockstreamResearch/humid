import { describe, expect, test } from "bun:test";

import lendingManifest from "../__fixtures__/current/lending_v3.manifest.json";
import { findAction, normaliseManifest } from "../document/normalise";
import type { ReferenceScope } from "../document/references";
import { encodeMetadataParts, type PartResolver } from "./metadataParts";
import { planAction } from "./plan";

// What an action publishes about itself, so its protocol's own reader can find it again. The
// vocabulary is closed on purpose: bytes in the wrong order still make a well-formed output in
// a transaction that confirms, and the only thing lost is that the record cannot be matched.

/** Resolves nothing, so the value under test is the one written in the part. */
function bytes(value: unknown, resolve?: PartResolver): string {
	const result = encodeMetadataParts(value, resolve);

	return result.ok ? result.hex : result.reason;
}

/** One part, which is the unit almost every question here is about. */
function part(declared: Record<string, unknown>, resolve?: PartResolver): string {
	return bytes({ parts: [declared] }, resolve);
}

describe("what each declared part type encodes to", () => {
	test("bytes are taken as they are, at whatever length the value carries", () => {
		expect(part({ type: "bytes", value: "0xa9b4ade7" })).toBe("a9b4ade7");
		expect(part({ type: "bytes", value: "0x" })).toBe("");
	});

	// Measured rather than reasoned. A reader of these bytes in production takes every integer
	// width here little-endian, and the published document agrees: it writes `endian: "le"` on
	// one of them and leaves the others to the default, which only makes sense if the default is
	// the same order. The runtime previously wrote one of these widths the other way round, on
	// the reasoning that a hand-written layout reads big-endian.
	test("integers are little-endian, which is the default when nothing says otherwise", () => {
		expect(part({ type: "u8", value: 1 })).toBe("01");
		expect(part({ type: "u16", value: 1000 })).toBe("e803");
		expect(part({ type: "u32", value: 900_000 })).toBe("a0bb0d00");
		expect(part({ type: "u64", value: 100_000 })).toBe("a086010000000000");
	});

	test("a decimal string is the number it spells, past what a double holds", () => {
		expect(part({ type: "u64", value: "9007199254740993" })).toBe("0100000000002000");
	});

	// The one modifier this vocabulary has. `le` is what the documents write, and it restates the
	// default rather than changing it; `be` is the reverse.
	test("endian states the order of an integer, and le is the default said out loud", () => {
		expect(part({ endian: "le", type: "u64", value: 1 })).toBe("0100000000000000");
		expect(part({ endian: "be", type: "u64", value: 1 })).toBe("0000000000000001");
	});

	// An asset id is stated one way and published the other. The reader writes it out of its
	// internal thirty-two-byte array, and that array is the reverse of the form every document,
	// request and screen states an id in — the same turn this wallet's chain reader performs in
	// the other direction when it reads an output's asset.
	test("an asset id is turned round, because it is stated in reverse of how it is published", () => {
		expect(part({ type: "liquid.asset_id", value: STATED_ASSET })).toBe(PUBLISHED_ASSET);
	});

	test("and an asset id is accepted with or without the prefix, being the same id", () => {
		expect(part({ type: "liquid.asset_id", value: `0x${STATED_ASSET}` })).toBe(PUBLISHED_ASSET);
	});

	test("parts are concatenated in the order they are written", () => {
		expect(
			bytes({
				parts: [
					{ type: "bytes", value: "0xa9b4ade7" },
					{ type: "u8", value: 2 },
				],
			}),
		).toBe("a9b4ade702");
	});
});

/** A deployment carrying exactly one field, so that everything else refuses by name. */
const resolve: PartResolver = (name) =>
	name === "instance.PROGRAM_ID"
		? { ok: true, value: "0xa9b4ade7" }
		: { ok: false, reason: `nothing named ${name}` };

// The rule is the format's own reference grammar and nothing else: a name, optionally
// namespaced, opening with a letter or an underscore. It is the same parser every other
// reference position asks, so a reference means one thing across the format.
describe("telling a name to look up from the bytes themselves", () => {
	test("a value the grammar accepts is looked up, never written", () => {
		expect(part({ type: "bytes", value: "instance.PROGRAM_ID" }, resolve)).toBe("a9b4ade7");
	});

	// A document writing bytes directly had them looked up as a name and refused for not
	// existing. This is the shape that failed: the ASCII of a short word, written as bare hex.
	test("a bare hexadecimal literal opening with a digit is bytes, because it cannot be a name", () => {
		expect(part({ type: "bytes", value: "6275726e" }, resolve)).toBe("6275726e");
	});

	test("a prefixed literal is bytes for the same reason, the prefix opening with a digit", () => {
		expect(part({ type: "bytes", value: "0xdeadbeef" }, resolve)).toBe("deadbeef");
	});

	// The direction the rule errs in, stated as a test so that it is a decision rather than an
	// accident. A four-byte tag written `a9b4ade7` is a perfect reference to a parameter of that
	// name, and an asset id opening with a letter is a perfect reference to a sixty-four
	// character one. Both are looked up; neither can become bytes nobody checked. Writing `0x`
	// in front settles it for good.
	test("a literal that could also be a name is looked up, and refuses by naming the text", () => {
		expect(part({ type: "bytes", value: "a9b4ade7" }, resolve)).toContain("a9b4ade7");
		expect(
			part({ type: "liquid.asset_id", value: STATED_ASSET.replace(/^0/, "a") }, resolve),
		).toContain("nothing named");
	});

	test("and a name nothing resolves refuses rather than encoding the name", () => {
		const refusal = part({ type: "bytes", value: "instance.MISSING" }, resolve);

		expect(refusal).toContain("instance.MISSING");
		expect(refusal).toContain("Data part 1");
	});

	// A resolved value is a value. It is never read as a name a second time, which is what keeps
	// a deployment field holding `a9b4ade7` from being looked up as a parameter.
	test("what a name resolves to is bytes, not another name", () => {
		expect(
			part({ type: "bytes", value: "instance.PROGRAM_ID" }, () => ({
				ok: true,
				value: "a9b4ade7",
			})),
		).toBe("a9b4ade7");
	});
});

// Widening the vocabulary is not opening it. Everything below stays refused, and each refusal
// says which part the wallet could not write.
describe("what it still refuses, and by name", () => {
	test("the sibling vocabulary's padding, which no document writes here", () => {
		expect(part({ pad_to: 8, type: "u8", value: 1 })).toContain("pad_to");
		expect(part({ align: "left", type: "u8", value: 1 })).toContain("align");
	});

	test("the sibling vocabulary's types, which no document writes here either", () => {
		expect(part({ type: "bytes32", value: `0x${"11".repeat(32)}` })).toContain("bytes32");
		expect(part({ type: "pubkey", value: `0x${"22".repeat(32)}` })).toContain("pubkey");
	});

	test("a type nobody has mapped at all", () => {
		expect(part({ type: "u128", value: 1 })).toContain("u128");
		expect(part({ type: 7, value: 1 })).toContain("7");
	});

	// On a run of bytes there is no number whose order it could be describing, and on an asset id
	// the turn is already what the type means — a second one stated beside it is two instructions
	// about the same bytes, and no document says which wins.
	test("endian where it has no established meaning", () => {
		expect(part({ endian: "be", type: "bytes", value: "0x0102" })).toContain("endian");
		expect(part({ endian: "be", type: "liquid.asset_id", value: STATED_ASSET })).toContain(
			"endian",
		);
	});

	test("an endianness this vocabulary cannot state", () => {
		const refusal = part({ endian: "middle", type: "u32", value: 1 });

		expect(refusal).toContain("middle");
		expect(refusal).toContain("le and be");
	});

	test("a value too wide for the width it was declared at, rather than truncating it", () => {
		expect(part({ type: "u8", value: 256 })).toContain("256");
		expect(part({ type: "u16", value: 65_536 })).toContain("65536");
	});

	test("a negative number, these encodings being unsigned", () => {
		expect(part({ type: "u32", value: -1 })).toContain("-1");
	});

	test("an asset id that is not thirty-two bytes", () => {
		expect(part({ type: "liquid.asset_id", value: "0x1122" })).toContain("4 hexadecimal");
	});

	test("bytes that are not a whole number of bytes, and bytes that are not hexadecimal", () => {
		expect(part({ type: "bytes", value: "0x010" })).toContain("010");
		expect(part({ type: "bytes", value: "0xzzzz" })).toContain("zzzz");
	});

	test("a part with a type and no value", () => {
		expect(part({ type: "u8" })).toContain("no value");
	});

	test("data that is not a parts list at all", () => {
		expect(bytes({ parts: "0x00" })).toContain("parts");
		expect(bytes({ parts: [7] })).toContain("Data part 1");
	});

	test("and every refusal says which part, the position being the only name a part has", () => {
		expect(
			bytes({
				parts: [
					{ type: "u8", value: 1 },
					{ type: "u8", value: 1 },
					{ type: "u8", value: 999 },
				],
			}),
		).toContain("Data part 3");
	});
});

/**
 * Thirty-two distinct bytes, so that a reversal that did not happen is visible.
 *
 * An id of one repeated byte reads the same either way round, which is how an encoder that
 * never turned one could pass a test that looked like it checked.
 */
const STATED_ASSET = "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20";
const PUBLISHED_ASSET = "201f1e1d1c1b1a191817161514131211100f0e0d0c0b0a090807060504030201";

/**
 * A deployment of the published protocol, filled in far enough to plan the two actions that
 * publish a record. The tags are the constants those documents carry as defaults.
 */
const LENDING = {
	COLLATERAL_AMOUNT: "500000",
	COLLATERAL_ASSET_ID: "c0".repeat(32),
	CURRENT_DEBT: "110000",
	FACTORY_ASSET_ID: "fa".repeat(32),
	FACTORY_PROGRAM_ID: "dd1e7f89",
	ISSUING_UTXOS_COUNT: "2",
	LENDER_NFT_ASSET_ID: "1e".repeat(32),
	LENDING_PROGRAM_ID: "a9b4ade7",
	LOAN_EXPIRATION_TIME: "900000",
	PRINCIPAL_AMOUNT: "100000",
	PRINCIPAL_ASSET_ID: STATED_ASSET,
	PRINCIPAL_INTEREST_RATE: "1000",
	PROTOCOL_FEE_KEEPER_ASSET_ID: "fe".repeat(32),
	REISSUANCE_FLAGS: "0",
	BORROWER_NFT_ASSET_ID: "b0".repeat(32),
};

const SCOPE: ReferenceScope = {
	fee: 0n,
	instance: LENDING,
	params: { LENDER_VAULT_AMOUNT: "105000", TOTAL_PROTOCOL_FEE: "5000" },
};

/** The script the action's record output pays to, which is the record and its OP_RETURN. */
function publishedRecord(name: string): string {
	const action = findAction(
		normaliseManifest(lendingManifest as unknown as Record<string, unknown>).manifest,
		name,
	);
	const plan = action && planAction(action, SCOPE);

	if (!plan?.ok) {
		throw new Error(plan ? plan.reason : `this document declares no ${name}`);
	}

	const record = plan.plan.outputs.find(
		(output) => output.target.kind === "data" && output.target.hex !== "6a",
	);

	return record?.target.kind === "data" ? record.target.hex : "";
}

// The claim these two make is not that a helper agrees with itself. Each document states the
// length of the record it publishes — one in a comment on the layout, one in the widths it
// declares — and both lengths come out of the push byte the wallet writes.
describe("the records the published corpus asks a wallet to publish", () => {
	test("a factory's creation record is its tag, a count and a bitmask: thirteen bytes", () => {
		expect(publishedRecord("CreateFactory")).toBe("6a0ddd1e7f89020000000000000000");
	});

	test("an offer's creation record is fifty bytes, and its asset id is turned round", () => {
		expect(publishedRecord("CreateOffer")).toBe(
			`6a32a9b4ade7${PUBLISHED_ASSET}a086010000000000a0bb0d00e803`,
		);
	});

	test("and the wallet writes the length each document states", () => {
		expect(payloadLength(publishedRecord("CreateFactory"))).toBe(13);
		expect(payloadLength(publishedRecord("CreateOffer"))).toBe(50);
	});
});

/** The push byte an OP_RETURN carries below 76 bytes, read back as a number. */
function payloadLength(script: string): number {
	return Number.parseInt(script.slice(2, 4), 16);
}
