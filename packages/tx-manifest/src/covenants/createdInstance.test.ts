import { describe, expect, test } from "bun:test";

import lendingV3 from "../__fixtures__/current/lending_v3.manifest.json";
import { findAction, normaliseManifest } from "../document/normalise";
import { resolveCreatedInstance } from "./instance";

/**
 * The deployment a constructor brings into existence, worked out from a published document.
 *
 * `instance.test.ts` covers the reference spellings and the fixed point. This covers the three
 * things a live protocol's constructor needs that a wallet reading only references cannot do:
 * a field the document computes, a covenant hash built with the leaves its own tree carries,
 * and a deployment read before the transaction's own inputs have produced everything.
 */

const { manifest } = normaliseManifest(lendingV3 as unknown as Record<string, unknown>);
const createOffer = findAction(manifest, "CreateOffer");

if (!createOffer) {
	throw new Error("The document declares no CreateOffer");
}

const SOURCES = {
	"./asset_auth.simf": "fn main() { asset_auth }",
	"./asset_auth_vault.simf": "fn main() { vault }",
	"./lending.simf": "fn main() { lending }",
};

/** A stand-in compiler whose answer depends on everything the real one is given. */
function hashOf(input: { argumentsJson: string; extraLeavesJson: string; source: string }): string {
	const digest = new Bun.CryptoHasher("sha256");

	digest.update(`${input.source} ${input.argumentsJson} ${input.extraLeavesJson}`);

	return digest.digest("hex");
}

const asset = (byte: string) => byte.repeat(32);

/** What the request supplies, which for this action is everything a person filled in. */
const PARAMS: Record<string, string> = {
	COLLATERAL_AMOUNT: "100000",
	COLLATERAL_ASSET_ID: asset("c1"),
	FACTORY_ASSET_ID: asset("f1"),
	LOAN_EXPIRATION_TIME: "1900000000",
	PRINCIPAL_AMOUNT: "50000",
	PRINCIPAL_ASSET_ID: asset("a1"),
	PRINCIPAL_INTEREST_RATE: "500",
	PROTOCOL_FEE_KEEPER_ASSET_ID: asset("e1"),
	ZERO_HASH: "00".repeat(32),
};

/** What the action's own inputs produced: two assets, neither of which existed beforehand. */
const ISSUED: Record<string, string> = {
	BORROWER_NFT_ASSET_ID: asset("b1"),
	LENDER_NFT_ASSET_ID: asset("d1"),
};

const resolve = (
	scope: { instance?: Record<string, string>; params: Record<string, string> },
	unresolved?: "omit" | "refuse",
) =>
	resolveCreatedInstance(createOffer, {
		contractSources: SOURCES,
		hashCovenant: hashOf,
		scope,
		...(unresolved === undefined ? {} : { unresolved }),
	});

describe("a deployment a constructor creates", () => {
	test("is worked out completely once the action's own inputs have produced their assets", () => {
		const found = resolve({ instance: ISSUED, params: PARAMS });

		expect(found.ok).toBe(true);

		if (!found.ok) {
			return;
		}

		expect(found.instance.fields.BORROWER_NFT_ASSET_ID).toBe(ISSUED.BORROWER_NFT_ASSET_ID);
		expect(found.instance.fields.LENDER_NFT_ASSET_ID).toBe(ISSUED.LENDER_NFT_ASSET_ID);
		expect(Object.keys(found.instance.fields)).toHaveLength(20);
	});

	// The field the protocol works out for itself rather than asking a person for. 5% of 50000
	// is 2500, and what a person would have been asked to type is a number they could get wrong.
	test("carries the value the document computes rather than one the request supplied", () => {
		const found = resolve({ instance: ISSUED, params: PARAMS });

		expect(found.ok && found.instance.fields.CURRENT_DEBT).toBe("52500");
	});

	// A hash built without the leaves is the hash of a different covenant. Nothing fails on it:
	// a hidden taproot node has no script to run and no witness to check, so the wrong hash goes
	// into a covenant that will simply never match the one the action creates.
	test("hashes a covenant with the extra leaves its own tree carries", () => {
		const found = resolve({ instance: ISSUED, params: PARAMS });
		const withLeaves = found.ok ? found.instance.fields.LENDING_COV_SCRIPT_HASH : "";
		const withoutLeaves = hashOf({
			argumentsJson: "",
			extraLeavesJson: "[]",
			source: SOURCES["./lending.simf"],
		});

		expect(withLeaves).not.toBe(withoutLeaves);
		expect(withLeaves).toHaveLength(64);
	});

	// The leaves read the field the document computes, so the two capabilities meet inside one
	// hash: change the debt and the covenant this action creates is a different covenant.
	test("and those leaves read the computed field, so the debt changes the hash", () => {
		const found = resolve({ instance: ISSUED, params: PARAMS });
		const other = resolve({
			instance: ISSUED,
			params: { ...PARAMS, PRINCIPAL_INTEREST_RATE: "600" },
		});

		expect(found.ok && other.ok).toBe(true);
		expect(found.ok && found.instance.fields.LENDING_COV_SCRIPT_HASH).not.toBe(
			other.ok && other.instance.fields.LENDING_COV_SCRIPT_HASH,
		);
	});

	// The type is written beside the value at this position, and it is the only thing that says
	// what width "1" is or that "false" is a flag rather than a five-letter string.
	test("compiles a tapleaf parameter written as a value, at the type declared beside it", () => {
		const found = resolve({ instance: ISSUED, params: PARAMS });

		expect(found.ok).toBe(true);
		expect(found.ok ? found.instance.rounds : 0).toBeGreaterThan(0);
	});
});

describe("the earlier moment, before the inputs have produced anything", () => {
	// Which asset an issuing input carries is itself one of these fields, so nothing could be
	// issued if every field had to wait for the issuance.
	test("answers with the fields the request already determines", () => {
		const found = resolve({ params: PARAMS }, "omit");

		expect(found.ok).toBe(true);
		expect(found.ok && found.instance.fields.COLLATERAL_ASSET_ID).toBe(PARAMS.COLLATERAL_ASSET_ID);
		expect(found.ok && found.instance.fields.PRINCIPAL_AMOUNT).toBe("50000");
	});

	test("leaves out what only the transaction can produce rather than refusing", () => {
		const found = resolve({ params: PARAMS }, "omit");

		expect(found.ok && "BORROWER_NFT_ASSET_ID" in found.instance.fields).toBe(false);
		expect(found.ok && "LENDER_NFT_ASSET_ID" in found.instance.fields).toBe(false);
	});

	// A covenant hash worked out from fields that were not all in yet is not an incomplete
	// answer, it is a wrong one — and nothing downstream could tell it from a right one.
	test("works out no covenant hash at all from a partial deployment", () => {
		const found = resolve({ params: PARAMS }, "omit");

		expect(found.ok && "LENDING_COV_SCRIPT_HASH" in found.instance.fields).toBe(false);
		expect(found.ok && found.instance.rounds).toBe(0);
	});

	test("and the same reading refuses the missing field when the deployment is recorded", () => {
		const found = resolve({ params: PARAMS });

		expect(found.ok).toBe(false);
		expect(found.ok ? "" : found.reason).toContain("BORROWER_NFT_ASSET_ID");
	});
});
