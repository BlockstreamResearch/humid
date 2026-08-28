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
import { parseReference } from "./document/references";
import { inspectConstructs, loadBearing } from "./document/registry";

// Both criteria this file answers are about the published corpus rather than about
// documents written to suit the reader, so every assertion below counts something in
// these twelve files. Three generations coexist in them: the older container spelling,
// the current one, and one document written in the oldest spelling of all.

const OLDER = {
	dex,
	last_will: lastWill,
	lending,
	lending_v2: lendingV2,
	lending_v3: lendingV3,
	p2pk,
	"p2pk-grouped": p2pkGrouped,
	zeroconf,
} as unknown as Record<string, Record<string, unknown>>;

const CURRENT = {
	dex: currentDex,
	last_will: currentLastWill,
	lending_v2: currentLendingV2,
	lending_v3: currentLendingV3,
	zeroconf: currentZeroconf,
} as unknown as Record<string, Record<string, unknown>>;

const ALL = { ...OLDER, ...CURRENT };

/** Every string anywhere in a document, with the key it sat under. */
function strings(node: unknown, at = ""): { at: string; text: string }[] {
	if (typeof node === "string") {
		return [{ at, text: node }];
	}

	if (Array.isArray(node)) {
		return node.flatMap((item, index) => strings(item, `${at}[${index}]`));
	}

	if (node && typeof node === "object") {
		return Object.entries(node).flatMap(([key, value]) =>
			strings(value, at === "" ? key : `${at}.${key}`),
		);
	}

	return [];
}

/** The two reference spellings, counted where a reference can actually appear. */
function referenceSpellings(document: Record<string, unknown>) {
	let deprecated = 0;
	let current = 0;

	for (const { at, text } of strings(document)) {
		// The wiring map keeps the older name as a key and is not a reference. Renaming it
		// would change which parameters a covenant compiles with, and therefore its address.
		if (at.includes("compile_params.") && !text.startsWith("compile_params.")) {
			continue;
		}

		const reference = parseReference(text);

		if (reference?.form !== "instance") {
			continue;
		}

		if (reference.deprecated) {
			deprecated += 1;
		} else {
			current += 1;
		}
	}

	return { current, deprecated };
}

describe("the version field cannot decide the generation", () => {
	test("every document in every generation declares the same format version", () => {
		const declared = new Set(
			Object.values(ALL).map((document) => document.manifest_version ?? document.compose_version),
		);

		expect([...declared]).toEqual(["0.1.0"]);
	});

	test("so the container spelling is what actually differs, and both are read", () => {
		for (const [name, document] of Object.entries(OLDER)) {
			expect({ [name]: "classes" in document || "actions" in document }).toEqual({
				[name]: true,
			});
		}

		for (const [name, document] of Object.entries(CURRENT)) {
			// zeroconf declares no actions in either generation, so it carries no container at
			// all. It is the smallest real document there is and it has to keep reading.
			const expected = name !== "zeroconf";

			expect({ [name]: "contract_templates" in document }).toEqual({ [name]: expected });
		}
	});

	test("and a document is normalised without its version being consulted", () => {
		for (const [name, document] of Object.entries(ALL)) {
			const withoutVersion = { ...document };

			delete withoutVersion.manifest_version;
			delete withoutVersion.compose_version;

			expect({ [name]: normaliseManifest(withoutVersion).manifest.actions }).toEqual({
				[name]: normaliseManifest(document).manifest.actions,
			});
		}
	});
});

describe("both reference spellings are live in the published corpus", () => {
	test("two protocols still carry the older spelling, in both generations", () => {
		const older = Object.entries(ALL)
			.filter(([, document]) => referenceSpellings(document).deprecated > 0)
			.map(([name]) => name)
			.toSorted();

		expect(older).toEqual(["last_will", "lending"]);
	});

	test("the rest carry the current one, so neither spelling can be dropped", () => {
		const current = Object.entries(ALL)
			.filter(([, document]) => referenceSpellings(document).current > 0)
			.map(([name]) => name)
			.toSorted();

		expect(current).toEqual(["dex", "lending_v2", "lending_v3"]);
	});

	test("and no document mixes them, which is what makes the split a generation", () => {
		for (const [name, document] of Object.entries(ALL)) {
			const { current, deprecated } = referenceSpellings(document);

			expect({ [name]: current > 0 && deprecated > 0 }).toEqual({ [name]: false });
		}
	});

	test("the reader resolves both to the same lookup", () => {
		const deprecated = parseReference("compile_params.OWNER");
		const current = parseReference("instance.OWNER");

		expect(deprecated).toMatchObject({ deprecated: true, form: "instance", name: "OWNER" });
		expect(current).toMatchObject({ form: "instance", name: "OWNER" });
	});
});

describe("a field the format has abandoned decides nothing", () => {
	// The published specification lists a top-level path to a contract source in one line and
	// says nothing about what a runtime does with it. The newer schema dropped it, the
	// reference implementation reads no such field, and no published manifest carries one.
	test("no published manifest carries a top-level contract source", () => {
		const carrying = Object.entries(ALL)
			.filter(([, document]) => typeof document.source === "string")
			.map(([name]) => name);

		expect(carrying).toEqual([]);
	});

	test("and a document that carries one is read rather than refused", () => {
		const withSource = { ...(ALL.p2pk as Record<string, unknown>), source: "./p2pk.simf" };
		const { manifest } = normaliseManifest(withSource);
		const blocking = loadBearing(inspectConstructs(manifest)).map((finding) => finding.key);

		expect(blocking).not.toContain("source");
	});
});
