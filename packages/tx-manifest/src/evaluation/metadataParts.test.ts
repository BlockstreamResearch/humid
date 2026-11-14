import { describe, expect, test } from "bun:test";

import lendingV2Manifest from "../__fixtures__/lending_v2/txmanifest.json";
import lendingManifest from "../__fixtures__/lending_v3/txmanifest.json";
import { Manifest } from "../document/manifest";
import type { ReferenceScope } from "../document/references";
import type { DataPart } from "../document/schema";
import { Refusal } from "../refusal";
import { concatParts, encodeMetadataParts, type PartResolver } from "./metadataParts";
import { planAction } from "./plan";

function part(declared: DataPart, resolve?: PartResolver): string {
	try {
		return encodeMetadataParts({ parts: [declared] }, resolve);
	} catch (error) {
		return error instanceof Refusal ? error.reason : String(error);
	}
}

const STATED_ASSET = "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20";
const PUBLISHED_ASSET = "201f1e1d1c1b1a191817161514131211100f0e0d0c0b0a090807060504030201";

const resolveTag: PartResolver = (name) => {
	if (name !== "params.TAG") {
		throw new Refusal("missing");
	}

	return "a9b4ade7";
};

describe("encoding object-form data parts", () => {
	test("integers are little-endian unless endian says be", () => {
		expect(part({ type: "u16", value: 1000 })).toBe("e803");
		expect(part({ type: "u64", value: "9007199254740993" })).toBe("0100000000002000");
		expect(part({ endian: "be", type: "u64", value: 1 })).toBe("0000000000000001");
	});

	test("an asset id is published in reverse of how it is stated", () => {
		expect(part({ type: "liquid.asset_id", value: `0x${STATED_ASSET}` })).toBe(PUBLISHED_ASSET);
	});

	test("a value the reference grammar accepts is resolved, and anything else is a literal", () => {
		expect(part({ type: "bytes", value: "params.TAG" }, resolveTag)).toBe("a9b4ade7");
		expect(part({ type: "bytes", value: "6275726e" }, resolveTag)).toBe("6275726e");
		expect(part({ type: "bytes", value: "a9b4ade7" }, resolveTag)).toContain("did not resolve");
	});

	test("a value too wide for its declared width is refused rather than truncated", () => {
		expect(part({ type: "u8", value: 256 })).toContain("Got 256");
	});

	test("types and modifiers outside the vocabulary are refused by name", () => {
		expect(part({ type: "bytes32", value: `0x${"11".repeat(32)}` })).toContain("bytes32");
		expect(part({ pad_to: 8, type: "u8", value: 1 })).toContain("pad_to");
		expect(part({ endian: "be", type: "bytes", value: "0x0102" })).toContain("endian");
	});
});

const SCOPE: ReferenceScope = {
	instance: {
		COLLATERAL_AMOUNT: "500000",
		FACTORY_PROGRAM_ID: "dd1e7f89",
		ISSUING_UTXOS_COUNT: "2",
		LENDING_PROGRAM_ID: "a9b4ade7",
		LOAN_EXPIRATION_TIME: "900000",
		PRINCIPAL_AMOUNT: "100000",
		PRINCIPAL_ASSET_ID: STATED_ASSET,
		PRINCIPAL_INTEREST_RATE: "1000",
		REISSUANCE_FLAGS: "0",
	},
	params: {},
};

function publishedRecord(name: string): string {
	const action = Manifest.parse(lendingManifest as unknown as Record<string, unknown>).action(name);

	if (!action) {
		throw new Error(`the document declares no ${name}`);
	}

	const record = planAction(action, SCOPE).outputs.find((output) => output.target.kind === "data");

	return record?.target.kind === "data" ? record.target.hex : "";
}

describe("the OP_RETURN records the lending protocol publishes", () => {
	test("a factory's creation record is its tag, a count and a flags word: thirteen bytes", () => {
		expect(publishedRecord("CreateFactory")).toBe("6a0ddd1e7f89020000000000000000");
	});

	test("an offer's creation record is fifty bytes, with its asset id reversed", () => {
		expect(publishedRecord("CreateOffer")).toBe(
			`6a32a9b4ade7${PUBLISHED_ASSET}a086010000000000a0bb0d00e803`,
		);
	});
});

describe("string-form data", () => {
	test("a concat record joins its values, reversing the one declared an asset id", () => {
		const manifest = Manifest.parse(lendingV2Manifest as unknown as Record<string, unknown>);
		const action = manifest.action("LockCollateral");

		if (!action) {
			throw new Error("the document declares no LockCollateral");
		}

		const key = "ab".repeat(32);
		const record = planAction(
			action,
			{
				instance: {
					...SCOPE.instance,
					BORROWER_PUB_KEY: key,
					FIRST_PARAMETERS_ENCODED: "1",
					SECOND_PARAMETERS_ENCODED: "1",
				},
				params: {},
			},
			manifest.paramTypes(action),
		).outputs.find((output) => output.id === "indexer_op_return");

		expect(record?.target).toEqual({ hex: `6a40${key}${PUBLISHED_ASSET}`, kind: "data" });
	});

	test("a string that is no concat(…) is refused", () => {
		expect(() => concatParts("instance.BORROWER_PUB_KEY", {})).toThrow(Refusal);
	});
});
