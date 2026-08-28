import { describe, expect, test } from "bun:test";

import {
	type ConstructReport,
	type ConstructSiteKind,
	type ConstructState,
	inspectManifestDocument,
} from "@humid/tx-manifest";
import dexManifest from "@humid/tx-manifest/fixtures/current/dex.manifest.json";
import lendingV3Manifest from "@humid/tx-manifest/fixtures/current/lending_v3.manifest.json";
import p2pkManifest from "@humid/tx-manifest/fixtures/p2pk.manifest.json";

import { groupByState } from "./groupByState";

// AC-04 and AC-05. What each field is comes from the package and is tested there; the order a
// person meets them in and how many rows that is are this surface's own decisions, and both
// are invisible when wrong — a table still renders, with the nine fields worth reading buried
// under six hundred that are working.

function report(
	state: ConstructState,
	key: string = state,
	at = "manifest",
	site: ConstructSiteKind = "manifest",
): ConstructReport {
	return { at, key, site, state };
}

function rowsFor(document: unknown): number {
	const inspection = inspectManifestDocument(document);

	if (!inspection.ok) {
		throw new Error("expected a readable document");
	}

	return groupByState(inspection.constructs).reduce((total, group) => total + group.rows.length, 0);
}

describe("the order fields are shown in", () => {
	test("leads with what no specification describes, and trails with what is working", () => {
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
			"never-read",
			"shown",
			"acted-on",
		]);
	});

	test("collapses only the states that mean nothing is wrong", () => {
		const grouped = groupByState([
			report("unrecognised"),
			report("unimplemented"),
			report("never-read"),
			report("shown"),
			report("acted-on"),
		]);

		expect(grouped.filter((group) => group.nothingWrong).map((group) => group.state)).toEqual([
			"shown",
			"acted-on",
		]);
	});

	test("shows no heading for a state this document does not use", () => {
		const grouped = groupByState([report("acted-on")]);

		expect(grouped).toHaveLength(1);
		expect(grouped[0]?.state).toBe("acted-on");
	});

	test("a document declaring nothing groups into nothing", () => {
		expect(groupByState([])).toEqual([]);
	});
});

describe("one row per construct, not per position", () => {
	test("gathers every position a key was found at into its one row", () => {
		const grouped = groupByState([
			report("acted-on", "amount_sat", "action Pay / output p2pk_out", "output"),
			report("acted-on", "amount_sat", "action Refund / output refund_out", "output"),
		]);

		expect(grouped[0]?.rows).toHaveLength(1);
		expect(grouped[0]?.rows[0]?.at).toEqual([
			"action Pay / output p2pk_out",
			"action Refund / output refund_out",
		]);
	});

	// The same key at two kinds of position is two constructs and can be in two states. Merging
	// them by name alone would print one row whose state is whichever the loop met last.
	test("keeps the same key apart when it sits at different kinds of position", () => {
		const grouped = groupByState([
			report("shown", "description", "action Pay", "action"),
			report("shown", "description", "action Pay / output p2pk_out", "output"),
		]);

		expect(grouped[0]?.rows).toHaveLength(2);
	});

	test("loses no position, so the whole document is still reachable", () => {
		const positions = groupByState([
			report("acted-on", "chain"),
			report("acted-on", "utxo_types"),
			report("shown", "description"),
		]).flatMap((group) => group.rows.flatMap((row) => row.at));

		expect(positions).toHaveLength(3);
	});
});

// AC-04's own numbers, taken from the published protocols rather than from a document written
// to make the assertion pass. The second figure in each name is what the table drew before
// this change: one row per position.
describe("what the published protocols now draw", () => {
	test("the deployed lending protocol: 57 rows rather than 620", () => {
		expect(rowsFor(lendingV3Manifest)).toBe(57);
	});

	test("the exchange protocol: 50 rows rather than 235", () => {
		expect(rowsFor(dexManifest)).toBe(50);
	});

	test("the simplest published protocol: 40 rows rather than 69", () => {
		expect(rowsFor(p2pkManifest)).toBe(40);
	});
});
