import { describe, expect, test } from "bun:test";

import { statedAsset } from "./asset";

const POLICY = "144c654344aa716d6f3abcc1ca90e5641e4e2a7f633bc09fe3baf64585819a49";
const TOKEN = "ce091c998b83c78bb71a632313ba3760f1763d9cfcffae02258ffa9865a37bd2";

describe("what a document has said about an asset", () => {
	// The keyword and the id are two spellings of one asset, and a document may write either.
	test("the network's own asset, under either spelling", () => {
		expect(statedAsset("lbtc", POLICY)).toEqual({ kind: "network" });
		expect(statedAsset("LBTC", POLICY)).toEqual({ kind: "network" });
		expect(statedAsset(POLICY, POLICY)).toEqual({ kind: "network" });
		expect(statedAsset(POLICY.toUpperCase(), POLICY)).toEqual({ kind: "network" });
	});

	test("an asset it names outright, which is not this network's own", () => {
		expect(statedAsset(TOKEN, POLICY)).toEqual({ id: TOKEN, kind: "identified" });
	});

	test("and a lookup it leaves to be resolved later", () => {
		expect(statedAsset("params.token", POLICY)).toEqual({
			kind: "deferred",
			reference: "params.token",
		});
		expect(statedAsset("instance.PRINCIPAL", POLICY)).toEqual({
			kind: "deferred",
			reference: "instance.PRINCIPAL",
		});
	});

	/**
	 * The order that decides it, and the reason it is that way round.
	 *
	 * A bare reference and an asset id are both runs of `[A-Za-z0-9_]` to a parser, so an id
	 * beginning with a letter parses as a perfectly good reference to something of that name.
	 * Length and alphabet separate the two and nothing else does, so the id is tested first.
	 */
	test("an id that would also parse as a name is read as the id", () => {
		const looksLikeAName = `feb3d9${"0".repeat(58)}`;

		expect(statedAsset(looksLikeAName, POLICY)).toEqual({
			id: looksLikeAName,
			kind: "identified",
		});
	});

	// A spelling that is neither a resolvable lookup nor an id is treated as an asset the
	// document identified, which is the safe direction: it is refused where it is funded,
	// rather than deferred into a check that will never be reached.
	test("and something that is neither is an asset rather than a lookup", () => {
		expect(statedAsset("not an asset", POLICY)).toEqual({
			id: "not an asset",
			kind: "identified",
		});
	});
});
