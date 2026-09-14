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
import { refuseUnsupported } from "./document/refuse";
import { ignored, inspectConstructs, loadBearing } from "./document/registry";

/**
 * What this runtime makes of documents nobody wrote for it.
 *
 * The seven published manifests and the two rewritings of them the corpus carries. Everything
 * asserted here counts something in these files rather than in a document composed to suit the
 * assertion — which is the only way to answer either of the questions this file exists for:
 * whether a construct is being stepped over in silence, and whether the two ways the format
 * spells a protocol come out the same.
 */

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

/**
 * Every document, with the two generations of one protocol kept apart.
 *
 * Merged by protocol name they would overwrite each other and half the corpus would go
 * unread — which is exactly the kind of silent narrowing the file is here to catch.
 */
const ALL: Record<string, Record<string, unknown>> = {
	...OLDER,
	...Object.fromEntries(
		Object.entries(CURRENT).map(([name, document]) => [`current/${name}`, document]),
	),
};

function normalised(document: Record<string, unknown>) {
	return normaliseManifest(document).manifest;
}

function refusalOf(document: Record<string, unknown>) {
	return refuseUnsupported(normalised(document), { compilerVersion: "0.6.0", contractSources: {} });
}

describe("nothing load-bearing is stepped over in silence", () => {
	// The measurement this slice exists to move, pinned rather than described. Every published
	// document is now read in full by this runtime's table except the oldest lending
	// generation, which asks for a witness this wallet cannot produce — a statement about the
	// wallet rather than about its reading, and the only one left.
	test("every published document is read in full, or refused for something it asks of the wallet", () => {
		const outcome = Object.fromEntries(
			Object.entries(ALL).map(([name, document]) => [
				name,
				refusalOf(document)?.reject ?? "read-in-full",
			]),
		);

		expect(outcome).toEqual({
			"current/dex": "read-in-full",
			"current/last_will": "read-in-full",
			"current/lending_v2": "read-in-full",
			"current/lending_v3": "read-in-full",
			"current/zeroconf": "read-in-full",
			dex: "read-in-full",
			last_will: "read-in-full",
			lending: "unproducible-witness",
			lending_v2: "read-in-full",
			lending_v3: "read-in-full",
			p2pk: "read-in-full",
			"p2pk-grouped": "read-in-full",
			zeroconf: "read-in-full",
		});
	});

	// Read in full means exactly that: no key in a position where being wrong could change what
	// gets signed is left unanswered. The assertion is against the table's own finding rather
	// than against the refusal above, because a refusal can be earned for other reasons and a
	// silent gap earns nothing at all.
	test("and no construct in a load-bearing position is left unanswered in any of them", () => {
		const unanswered = Object.fromEntries(
			Object.entries(ALL)
				.map(([name, document]) => [name, unreadIn(document)] as const)
				.filter(([, keys]) => keys.length > 0),
		);

		expect(unanswered).toEqual({});
	});

	// The other half of the same claim, and what keeps the first from being satisfied by
	// refusing everything: what is passed over is passed over on purpose. Each of these five is
	// a key some published document carries, and each is in the table with a written reason.
	test("while what decides nothing is passed over on purpose, not by accident", () => {
		const passed = new Set(
			Object.values(ALL).flatMap((document) =>
				ignored(inspectConstructs(normalised(document))).map((finding) => finding.key),
			),
		);

		expect([...passed].toSorted()).toEqual([
			"$comment",
			"$schema",
			"attestation_version",
			"formula",
			"intent",
		]);
	});

	// A construct nothing acts on has to be refused rather than reported: a document read
	// halfway and signed on the part that was understood is the failure this whole table
	// exists to prevent.
	test("and one added to a published document is refused rather than reported", () => {
		const tampered = structuredClone(ALL.p2pk ?? {}) as Record<string, unknown>;
		const actions = tampered.actions as Record<string, Record<string, unknown>>;

		(actions.Pay ?? {}).on_validate = "assert!(true)";

		expect(refusalOf(tampered)?.reject).toBe("unimplemented-construct");
	});
});

describe("the version field cannot decide the generation", () => {
	test("every document in every generation declares the same format version", () => {
		const declared = new Set(
			Object.values(ALL).map((document) => document.manifest_version ?? document.compose_version),
		);

		expect([...declared]).toEqual(["0.1.0"]);
	});

	// So a runtime that branched on the version would read two of the three lending
	// generations wrong. What actually differs is the container spelling, and both are read.
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

	// The oldest spelling of the version is rewritten rather than met as a field nobody has
	// seen — otherwise the one document carrying it is refused for its spelling.
	test("and the oldest spelling of it is answered rather than refused", () => {
		const unread = loadBearing(inspectConstructs(normalised(OLDER["p2pk-grouped"] ?? {}))).map(
			(finding) => finding.key,
		);

		expect(unread).not.toContain("compose_version");
	});
});

describe("both generations of a protocol are read the same way", () => {
	// The two generations are not two spellings of one text: the newer files drop validations,
	// rename `formula` to `compute` and `source: wallet_key` to `compute: {type: wallet}`, and
	// leave the class off the block that creates a deployment. So what has to match is what
	// this runtime makes of them, not what they say — and each of those renames is a place a
	// runtime reading only one generation reads the other as a field nobody has seen.
	for (const name of Object.keys(CURRENT)) {
		const older = OLDER[name] ?? {};
		const current = CURRENT[name] ?? {};

		test(`${name} declares the same actions in either container spelling`, () => {
			expect(namesOf(current)).toEqual(namesOf(older));
		});

		test(`${name} meets the same constructs in both, whatever each generation calls them`, () => {
			expect(unreadIn(current)).toEqual(unreadIn(older));
		});

		test(`${name} is refused, or not refused, the same way in both`, () => {
			expect(refusalOf(current)?.reject).toEqual(refusalOf(older)?.reject);
		});
	}

	// The published p2pk against the same protocol written in the oldest spellings there are.
	// Nothing published carries a legacy twin, so this is the only place two declaration shapes
	// of one text can be shown to converge exactly rather than merely to be read alike.
	test("and the two declaration shapes of p2pk converge on the same actions outright", () => {
		const grouped = normalised(OLDER["p2pk-grouped"] ?? {});
		const flat = normalised(OLDER.p2pk ?? {});

		expect(grouped.actions.map((action) => action.name).toSorted()).toEqual(
			flat.actions.map((action) => action.name).toSorted(),
		);

		for (const action of flat.actions) {
			const twin = grouped.actions.find((candidate) => candidate.name === action.name);

			expect({ [action.name]: comparable(twin?.node) }).toEqual({
				[action.name]: comparable(action.node),
			});
		}
	});
});

describe("both reference spellings are live in the corpus", () => {
	// `compile_params.X` and `instance.X` are the same lookup, and a runtime dropping either is
	// as blind to one generation as it was to the other.
	test("two protocols still carry the older spelling", () => {
		const older = Object.entries(ALL)
			.filter(([, document]) => spellings(document).deprecated > 0)
			.map(([name]) => name)
			.toSorted();

		expect(older).toEqual(["current/last_will", "last_will", "lending"]);
	});

	test("the rest carry the current one, so neither can be dropped", () => {
		const current = Object.entries(ALL)
			.filter(([, document]) => spellings(document).current > 0)
			.map(([name]) => name)
			.toSorted();

		expect(current).toEqual([
			"current/dex",
			"current/lending_v2",
			"current/lending_v3",
			"dex",
			"lending_v2",
			"lending_v3",
		]);
	});

	test("and the reader resolves both to the same lookup", () => {
		expect(parseReference("compile_params.OWNER")).toMatchObject({
			deprecated: true,
			form: "instance",
			name: "OWNER",
		});
		expect(parseReference("instance.OWNER")).toMatchObject({ form: "instance", name: "OWNER" });
	});
});

/** Every action name a document declares, whichever container spelling it used. */
function namesOf(document: Record<string, unknown>): string[] {
	return normalised(document)
		.actions.map((action) => action.name)
		.toSorted();
}

/** Which load-bearing constructs a document carries that nothing in this runtime acts on. */
function unreadIn(document: Record<string, unknown>): string[] {
	return [
		...new Set(loadBearing(inspectConstructs(normalised(document))).map((found) => found.key)),
	].toSorted();
}

/**
 * One action's declaration, with what a generation is free to differ in removed.
 *
 * The description is prose written for a person and the two generations reword it; the
 * constructor flag is the rename itself, normalised from `deploy` and asserted separately.
 * Everything left decides what gets built, and must be identical.
 */
function comparable(node: Record<string, unknown> | undefined): unknown {
	if (!node) {
		return undefined;
	}

	const rest = { ...node };

	for (const key of ["$comment", "description", "is_constructor", "ui"]) {
		delete rest[key];
	}

	return rest;
}

/** The two reference spellings, counted where a reference can actually appear. */
function spellings(document: Record<string, unknown>): { current: number; deprecated: number } {
	let deprecated = 0;
	let current = 0;

	for (const { at, text } of strings(document)) {
		// The wiring map keeps the older name as a key and is not a reference. Renaming it would
		// change which parameters a covenant compiles with, and therefore its address.
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

/** Every string anywhere in a document, with the path it sat at. */
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
