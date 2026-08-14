import { describe, expect, test } from "bun:test";

import currentDex from "./__fixtures__/current/dex.manifest.json";
import currentLastWill from "./__fixtures__/current/last_will.manifest.json";
import currentLendingV2 from "./__fixtures__/current/lending_v2.manifest.json";
import currentLendingV3 from "./__fixtures__/current/lending_v3.manifest.json";
import currentZeroconf from "./__fixtures__/current/zeroconf.manifest.json";
import dex from "./__fixtures__/dex.manifest.json";
import lastWill from "./__fixtures__/last_will.manifest.json";
import lending from "./__fixtures__/lending.manifest.json";
import lendingV2 from "./__fixtures__/lending_v2.manifest.json";
import lendingV3 from "./__fixtures__/lending_v3.manifest.json";
import p2pkGrouped from "./__fixtures__/p2pk-grouped.manifest.json";
import p2pk from "./__fixtures__/p2pk.manifest.json";
import zeroconf from "./__fixtures__/zeroconf.manifest.json";
import { normaliseManifest } from "./document/normalise";
import { type ConstructState, describeConstructs } from "./document/registry";

/**
 * Every manifest this project holds, in both generations.
 *
 * The accounting has to be over all of them rather than over the current set: a construct
 * this wallet stopped reading would be invisible in a check that only looks at the newest
 * documents, and two of the three generations are older ones people still deployed.
 */
const EVERY_MANIFEST = {
	current_dex: currentDex,
	current_last_will: currentLastWill,
	current_lending_v2: currentLendingV2,
	current_lending_v3: currentLendingV3,
	current_zeroconf: currentZeroconf,
	dex,
	last_will: lastWill,
	lending,
	lending_v2: lendingV2,
	lending_v3: lendingV3,
	p2pk,
	p2pk_grouped: p2pkGrouped,
	zeroconf,
} as unknown as Record<string, Record<string, unknown>>;

/** Every construct any of them declares, grouped by what this wallet makes of it. */
function accounted(): Record<ConstructState, string[]> {
	const byState = new Map<ConstructState, Set<string>>();

	for (const name of Object.keys(EVERY_MANIFEST)) {
		for (const report of describeConstructs(normaliseManifest(EVERY_MANIFEST[name]!).manifest)) {
			const keys = byState.get(report.state) ?? new Set<string>();

			keys.add(report.key);
			byState.set(report.state, keys);
		}
	}

	return Object.fromEntries(
		[...byState].map(([state, keys]) => [state, [...keys].toSorted()]),
	) as Record<ConstructState, string[]>;
}

// The whole point of this bundle, asserted as one fact rather than inferred from nine.
describe("every construct the published corpus uses", () => {
	test("is one this wallet acts on, shows, or deliberately reads for nothing", () => {
		const states = accounted();

		expect(states.unimplemented ?? []).toEqual([]);
		expect(states.unrecognised ?? []).toEqual([]);
	});

	// The six that stand deliberately, each with its reason written beside it in the construct
	// table. Two belong to JSON documents rather than to this format. One is a signature slot
	// that does not exist and no implementation reads. One is a flag the format's newer
	// generation dropped, because the block beside it says the same thing better. One is a
	// field the reference implementation's own comment calls informational. And one is a
	// sentence written for whoever approves the action, which interpolates values through a
	// syntax no specification describes — a confident sentence about the wrong amounts changes
	// what a person agrees to, so it is not shown either.
	test("or, for six of them, one it names a reason for reading past", () => {
		expect(accounted()["never-read"]).toEqual([
			"$comment",
			"$schema",
			"attestation_version",
			"formula",
			"intent",
			"is_constructor",
		]);
	});

	test("and thirty-nine of them decide what gets signed", () => {
		expect(accounted()["acted-on"]).toHaveLength(39);
	});
});
