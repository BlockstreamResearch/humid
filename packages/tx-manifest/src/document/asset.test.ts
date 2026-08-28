import { describe, expect, test } from "bun:test";

import { identifiedForeignAsset, refuseUnfundableAsset, statedAsset } from "./asset";
import { findAction, normaliseManifest } from "./normalise";

// AC-06. The rule that decides which asset a document is talking about, and the rule that
// decides whether this wallet can pay in it. They used to be one check that could only answer
// the first question and was asked the second.

const POLICY = "144c654344aa716d6f3abcc1ca90e5641e4e2a7f633bc09fe3baf64585819a49";
/** Another real Liquid asset id. It begins with a letter, which is the whole reason it is here. */
const OTHER = "feb3d9c9f2a9aaab816c2e93cfd4479f841b8e05596b8418ed0fd56e0b8d2e6d";

describe("what a document has said about an asset", () => {
	test.each([["lbtc"], ["LBTC"], [POLICY], [POLICY.toUpperCase()]])(
		"%s is the network's own asset",
		(declared) => {
			expect(statedAsset(declared, POLICY).kind).toBe("network");
		},
	);

	test.each([["instance.X"], ["compile_params.X"], ["params.X"], ["args.X"], ["BARE"]])(
		"%s is a lookup the document has deferred",
		(declared) => {
			expect(statedAsset(declared, POLICY).kind).toBe("deferred");
		},
	);

	// The dex protocol writes this: "the asset that input arrived in", named without naming it.
	test("an attribute of another input is deferred too", () => {
		expect(statedAsset("payout_in.asset", POLICY).kind).toBe("deferred");
	});

	test("an asset id the document names outright is identified", () => {
		expect(statedAsset(OTHER, POLICY)).toEqual({ id: OTHER, kind: "identified" });
	});

	// The trap this ordering exists for. An asset id is a run of `[a-f0-9]`, and a bare
	// reference is a run of `[A-Za-z0-9_]`, so every id beginning with a letter is also a
	// syntactically perfect reference to something with a sixty-four-character name. Asking the
	// reference parser first gets this backwards on real money, and the corpus contains ids of
	// both shapes.
	test("an asset id beginning with a letter is an id, not a reference to something named that", () => {
		expect(statedAsset(OTHER, POLICY).kind).toBe("identified");
		expect(statedAsset(`2${OTHER.slice(1)}`, POLICY).kind).toBe("identified");
	});

	// Refused rather than deferred, which is the safe direction: a spelling nothing can resolve
	// must not be handed to a later check that will never manage to run.
	test("text that is neither an id nor a lookup is treated as an asset it named", () => {
		expect(statedAsset("not a reference!", POLICY).kind).toBe("identified");
	});
});

/** One action declaring the same asset at an input and an output. */
function actionMoving(asset: string) {
	const { manifest } = normaliseManifest({
		actions: {
			Move: {
				inputs: [{ asset, id: "in_one", utxo_source: "wallet" }],
				outputs: [{ amount_sat: 1000, asset, destination: "wallet", id: "out_one" }],
			},
		},
		chain: "liquid",
	});
	const action = findAction(manifest, "Move");

	if (!action) {
		throw new Error("expected a Move action");
	}

	return action;
}

describe("what the document alone can settle", () => {
	test("an asset the document names, and this wallet does not move", () => {
		expect(identifiedForeignAsset(actionMoving(OTHER), POLICY)).toEqual({
			asset: OTHER,
			at: "in_one",
		});
	});

	test("and nothing, when the document named the network's own asset", () => {
		expect(identifiedForeignAsset(actionMoving("lbtc"), POLICY)).toBeUndefined();
	});

	// The correction. A lookup is not an asset yet, and refusing one claims the action moves
	// money this wallet cannot — which reading the document has not established.
	test("and nothing, when the document deferred the answer", () => {
		expect(identifiedForeignAsset(actionMoving("instance.PRINCIPAL"), POLICY)).toBeUndefined();
	});
});

describe("whether this wallet can fund the action, once the lookups resolve", () => {
	test("it cannot, when the lookup resolves to an asset it does not hold", () => {
		const refusal = refuseUnfundableAsset(actionMoving("instance.PRINCIPAL"), POLICY, {
			instance: { PRINCIPAL: OTHER },
			params: {},
		});

		expect(refusal).toContain(OTHER);
		expect(refusal).toContain("funds an action only in the network's own asset");
	});

	test.each([[POLICY], ["lbtc"]])("it can, when the lookup resolves to %s", (resolved) => {
		expect(
			refuseUnfundableAsset(actionMoving("instance.PRINCIPAL"), POLICY, {
				instance: { PRINCIPAL: resolved },
				params: {},
			}),
		).toBeUndefined();
	});

	// Not knowing what is being paid in is exactly the moment not to pay. A lookup with nothing
	// to resolve against is refused rather than waved through as "no foreign asset found".
	test("it will not, when the lookup cannot be resolved at all", () => {
		expect(
			refuseUnfundableAsset(actionMoving("instance.PRINCIPAL"), POLICY, { params: {} }),
		).toContain("could not establish what that is");
	});

	test("nor when the lookup resolves to something that is not an asset id", () => {
		expect(
			refuseUnfundableAsset(actionMoving("instance.PRINCIPAL"), POLICY, {
				instance: { PRINCIPAL: 7 },
				params: {},
			}),
		).toContain("not an asset id");
	});

	test("and an asset named outright is still refused here as well", () => {
		expect(refuseUnfundableAsset(actionMoving(OTHER), POLICY, { params: {} })).toContain(OTHER);
	});

	test("while the network's own asset needs no lookup and is funded", () => {
		expect(refuseUnfundableAsset(actionMoving("lbtc"), POLICY, { params: {} })).toBeUndefined();
	});
});
