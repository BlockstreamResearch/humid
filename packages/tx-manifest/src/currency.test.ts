import { describe, expect, test } from "bun:test";

import currentDex from "./__fixtures__/current/dex.manifest.json";
import currentLastWill from "./__fixtures__/current/last_will.manifest.json";
import currentLendingV2 from "./__fixtures__/current/lending_v2.manifest.json";
import currentLendingV3 from "./__fixtures__/current/lending_v3.manifest.json";
import currentZeroconf from "./__fixtures__/current/zeroconf.manifest.json";
import frozenDex from "./__fixtures__/dex.manifest.json";
import frozenLastWill from "./__fixtures__/last_will.manifest.json";
import frozenLendingV2 from "./__fixtures__/lending_v2.manifest.json";
import frozenLendingV3 from "./__fixtures__/lending_v3.manifest.json";
import { normaliseManifest } from "./document/normalise";
import { inspectConstructs, loadBearing } from "./document/registry";

// The same protocols in two generations, which is the only thing that can catch the format
// moving under this wallet. It moved once already: the container holding a contract's actions
// was renamed, every published protocol stopped being readable, and the wallet's own checks
// said nothing because they run against copies frozen before the rename.
//
// So these numbers are the point rather than the assertions around them. When they change,
// the format has moved and someone has to look — which is what did not happen last time.

const POLICY_ASSET = "144c654344aa716d6f3abcc1ca90e5641e4e2a7f633bc09fe3baf64585819a49";

const CURRENT = {
	dex: currentDex,
	last_will: currentLastWill,
	lending_v2: currentLendingV2,
	lending_v3: currentLendingV3,
	zeroconf: currentZeroconf,
} as unknown as Record<string, Record<string, unknown>>;

const FROZEN = {
	dex: frozenDex,
	last_will: frozenLastWill,
	lending_v2: frozenLendingV2,
	lending_v3: frozenLendingV3,
} as unknown as Record<string, Record<string, unknown>>;

function actionsIn(document: Record<string, unknown>): number {
	return normaliseManifest(document).manifest.actions.length;
}

/** What still stops each action, by the name of the construct that stops it. */
function blockedBy(document: Record<string, unknown>): string[] {
	const { manifest } = normaliseManifest(document);

	return [
		...new Set(loadBearing(inspectConstructs(manifest)).map((finding) => finding.key)),
	].toSorted();
}

describe("the protocols as their authors publish them now", () => {
	test("every action is found, in the vocabulary they currently use", () => {
		const found = Object.fromEntries(
			Object.keys(CURRENT).map((name) => [name, actionsIn(CURRENT[name]!)]),
		);

		expect(found).toEqual({
			dex: 4,
			last_will: 4,
			lending_v2: 9,
			lending_v3: 6,
			zeroconf: 0,
		});
	});

	// The rename is added and never traded. A wallet that read only the newer spelling would be
	// as blind to the previous generation as it was to this one, and the corpus keeps several
	// generations of the same protocol side by side on purpose.
	test("and the same count is found in the generation before it", () => {
		for (const name of Object.keys(FROZEN)) {
			expect(actionsIn(FROZEN[name]!)).toBe(actionsIn(CURRENT[name]!));
		}
	});

	test("nothing in any of them is a field no position describes", () => {
		for (const name of Object.keys(CURRENT)) {
			const unrecognised = loadBearing(
				inspectConstructs(normaliseManifest(CURRENT[name]!).manifest),
			).filter((finding) => !finding.declared);

			expect({ [name]: unrecognised.map((finding) => `${finding.key} at ${finding.at}`) }).toEqual({
				[name]: [],
			});
		}
	});

	// Every remaining refusal names a feature this wallet has never built, rather than a word it
	// has not been told. Which features, and how many of each, is what says whether performing
	// these protocols is close or far.
	test("what still stops each one is a feature, and it is named", () => {
		const blocked = Object.fromEntries(
			Object.keys(CURRENT).map((name) => [name, blockedBy(CURRENT[name]!)]),
		);

		expect(blocked).toEqual({
			dex: ["confidential", "default", "required_index", "simplicity_type", "value"],
			last_will: ["default", "required_index", "simplicity_type", "value"],
			lending_v2: [
				"compute",
				"confidential",
				"default",
				"issuance",
				"required_index",
				"simplicity_type",
				"value",
			],
			lending_v3: [
				"compute",
				"confidential",
				"default",
				"issuance",
				"required_index",
				"simplicity_type",
				"value",
			],
			zeroconf: [],
		});
	});

	// The number the whole change is about, and the one an estimate got wrong. Counting the keys
	// on an action's own node says sixteen of these are clear; counting the action's whole
	// subtree — its inputs, its outputs, the witnesses inside them — says two. The blockers are
	// mostly a level down from where an action is named, which is exactly where an estimate does
	// not look.
	test("and how many of those actions carry nothing this wallet refuses", () => {
		const counted = Object.fromEntries(
			Object.keys(CURRENT).map((name) => {
				const { manifest } = normaliseManifest(CURRENT[name]!);
				const blocked = new Set(
					loadBearing(inspectConstructs(manifest)).map((finding) => finding.at.split(" / ")[0]),
				);

				return [
					name,
					{
						found: manifest.actions.length,
						unblocked: manifest.actions.filter((action) => !blocked.has(`action ${action.name}`))
							.length,
					},
				];
			}),
		);

		expect(counted).toEqual({
			dex: { found: 4, unblocked: 1 },
			last_will: { found: 4, unblocked: 0 },
			lending_v2: { found: 9, unblocked: 1 },
			lending_v3: { found: 6, unblocked: 0 },
			zeroconf: { found: 0, unblocked: 0 },
		});
	});

	// The one published protocol this wallet refuses nothing about. It declares no actions, so
	// nothing can be performed from it either — which is worth stating rather than letting an
	// empty refusal list read as success.
	test("and one of them is refused for nothing at all, having nothing in it", () => {
		expect(blockedBy(CURRENT.zeroconf!)).toEqual([]);
		expect(actionsIn(CURRENT.zeroconf!)).toBe(0);
	});

	test("the build mode a protocol states is read wherever it states it", () => {
		const { manifest, notes } = normaliseManifest(CURRENT.lending_v3!);

		expect(manifest.node.compile_debug_symbols).toBe(true);
		expect(notes.some((note) => note.found === "simplicity_hl.debug_symbols")).toBe(true);
	});

	test("and a protocol stating it the older way keeps being read", () => {
		expect(normaliseManifest(FROZEN.lending_v3!).manifest.node.compile_debug_symbols).toBe(true);
	});
});

// Guards the thing that made this invisible: a policy asset is needed to judge these documents
// at all, and every count above is taken with the same one the wallet uses.
test("every count above is taken against the network's own asset", () => {
	expect(POLICY_ASSET).toHaveLength(64);
});
