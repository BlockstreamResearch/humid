import { describe, expect, test } from "bun:test";

import type { ConstructReport, ConstructState } from "@humid/tx-manifest";

import { groupByState } from "./groupByState";

// AC-03's ordering half. What each field is comes from the package and is tested there; the
// order a person meets them in is this surface's own decision, and the reason it is worth
// asserting is that getting it wrong is invisible — a table still renders, with the field
// that would stop the build buried under thirty that would not.

function report(state: ConstructState, key: string = state): ConstructReport {
	return { at: "manifest", key, state };
}

describe("the order fields are shown in", () => {
	test("leads with what no specification describes, and trails with what nothing reads", () => {
		const grouped = groupByState([
			report("never-read"),
			report("shown"),
			report("acted-on"),
			report("unimplemented"),
			report("unrecognised"),
		]);

		expect(grouped.map((group) => group.state)).toEqual([
			"unrecognised",
			"unimplemented",
			"acted-on",
			"shown",
			"never-read",
		]);
	});

	test("shows no heading for a state this document does not use", () => {
		const grouped = groupByState([report("acted-on")]);

		expect(grouped).toHaveLength(1);
		expect(grouped[0]?.state).toBe("acted-on");
	});

	test("keeps every field, so nothing is grouped away", () => {
		const constructs = [
			report("acted-on", "chain"),
			report("acted-on", "utxo_types"),
			report("shown", "description"),
		];

		const kept = groupByState(constructs).flatMap((group) => group.entries);

		expect(kept).toHaveLength(3);
		expect(kept.map((entry) => entry.key).toSorted()).toEqual([
			"chain",
			"description",
			"utxo_types",
		]);
	});

	test("a document declaring nothing groups into nothing", () => {
		expect(groupByState([])).toEqual([]);
	});
});
