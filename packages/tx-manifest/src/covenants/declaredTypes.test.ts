import { describe, expect, test } from "bun:test";

import dexManifest from "../__fixtures__/current/dex.manifest.json";
import lendingManifest from "../__fixtures__/current/lending_v3.manifest.json";
import groupedDexManifest from "../__fixtures__/dex.manifest.json";
import groupedLendingManifest from "../__fixtures__/lending_v3.manifest.json";
import p2pkManifest from "../__fixtures__/p2pk.manifest.json";
import { findAction, normaliseManifest } from "../document/normalise";
import { declaredParamTypes } from "./declaredTypes";

/**
 * Where a covenant parameter's type is stated, read off the published documents themselves.
 *
 * The two positions are not two generations. One document writes both, because a protocol's
 * constructor takes the values as parameters and every action after it reads them back off the
 * deployment those parameters created.
 */

function typesFor(document: unknown, action: string): Record<string, string> {
	const { manifest } = normaliseManifest(document as Record<string, unknown>);
	const found = findAction(manifest, action);

	if (!found) {
		throw new Error(`This fixture declares no action named ${action}.`);
	}

	return declaredParamTypes(manifest, found);
}

describe("types an action declares for itself", () => {
	test("are read, as they always were", () => {
		expect(typesFor(p2pkManifest, "Pay")).toMatchObject({ pubkey: "pubkey" });
	});

	// MakeOffer takes the offer's terms as parameters, and its covenant is wired to them by
	// bare name — so this is where the swap's asset ids and amounts are stated.
	test("including the ones a swap's constructor takes", () => {
		expect(typesFor(dexManifest, "MakeOffer")).toMatchObject({
			AMOUNT_B: "u64",
			ASSET_B: "liquid.asset_id",
			MAKER_PUB_KEY: "pubkey",
			MAX_FEE: "u64",
			TIMEOUT: "u32",
		});
	});
});

describe("types the deployment declares", () => {
	/**
	 * `Settle` takes no parameters at all. Every value its covenant is compiled with is a field
	 * of the offer that already exists, and the container declares their types once for every
	 * action performed against it. Reading only the action is why this one had nothing to
	 * encode against while the constructor beside it worked.
	 */
	test("are read for an action that declares none of its own", () => {
		expect(typesFor(dexManifest, "Settle")).toMatchObject({
			AMOUNT_B: "u64",
			ASSET_B: "liquid.asset_id",
			MAKER_SPK: "bytes32",
			MAX_FEE: "u64",
			OFFER_ASSET_ID: "liquid.asset_id",
			TIMEOUT: "u32",
		});
	});

	test("and for the lending protocol's factory, whose covenant is two integers", () => {
		expect(typesFor(lendingManifest, "CreateOffer")).toMatchObject({
			ISSUING_UTXOS_COUNT: "u8",
			REISSUANCE_FLAGS: "u64",
		});
	});

	test("without disturbing the action's own, which win where both declare a name", () => {
		const types = typesFor(lendingManifest, "CreateFactory");

		// The factory's container and its constructor both declare these, and agree. What the
		// test pins is that the constructor's declaration is the one that survives the merge:
		// a value comes from the request before it comes from the deployment, so its type has
		// to be read in that order.
		expect(types).toMatchObject({ ISSUING_UTXOS_COUNT: "u8", REISSUANCE_FLAGS: "u64" });
	});
});

describe("a covenant hash the deployment records", () => {
	// Declared outright by the container, like every other field. What makes these worth
	// pinning is that they are the values the lending covenant's own address is built from.
	test("is read from the container's declaration, not from the shape of its value", () => {
		const types = typesFor(lendingManifest, "CreateOffer");

		expect(types.LENDER_VAULT_COV_HASH).toBe("bytes32");
		expect(types.PRINCIPAL_OUTPUT_SCRIPT_HASH).toBe("bytes32");
		expect(types.ZERO_HASH).toBe("bytes32");
	});
});

/**
 * The container that holds a deployment's fields was renamed with the actions inside it —
 * `classes` became `contract_templates` — and the corpus keeps both generations of the same
 * protocols side by side. A runtime reading only the newer name is blind to every older
 * document, which is the exact failure that once hid all five of these from this wallet.
 */
describe("the generation the document was written in", () => {
	test("does not decide whether its deployment's declarations are read", () => {
		expect(typesFor(groupedDexManifest, "Settle")).toEqual(typesFor(dexManifest, "Settle"));
	});

	test("for the lending protocol either, whose factory covenant is two integers", () => {
		expect(typesFor(groupedLendingManifest, "CreateOffer")).toMatchObject({
			ISSUING_UTXOS_COUNT: "u8",
			REISSUANCE_FLAGS: "u64",
		});
	});
});

/**
 * No published document leaves a declaration without a type, so this is the rule stated
 * directly rather than found in the corpus. It is here because the failure it prevents is
 * silent: a name with a made-up type is encoded and compiled and produces an address, where a
 * name with no type is refused.
 */
describe("a declaration that states no type", () => {
	const document = {
		contract_templates: {
			Thing: {
				actions: { Do: { params: { SUPPLIED: { type: "u64" } } } },
				fields: { DESCRIBED_ONLY: { description: "no type here" }, TYPED: { type: "u8" } },
			},
		},
	};

	test("gives the name no type, rather than one chosen for it", () => {
		const types = typesFor(document, "Do");

		expect(types).toEqual({ SUPPLIED: "u64", TYPED: "u8" });
		expect("DESCRIBED_ONLY" in types).toBe(false);
	});
});

describe("a free action", () => {
	test("belongs to no deployment, so it reads only its own", () => {
		const types = typesFor(p2pkManifest, "Receive");

		expect(Object.values(types)).not.toContain("liquid.asset_id");
	});
});
