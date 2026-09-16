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

	test("and no construct in a load-bearing position is left unanswered in any of them", () => {
		const unanswered = Object.fromEntries(
			Object.entries(ALL)
				.map(([name, document]) => [name, unreadIn(document)] as const)
				.filter(([, keys]) => keys.length > 0),
		);

		expect(unanswered).toEqual({});
	});

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

	test("and one added to a published document is refused rather than reported", () => {
		const tampered = structuredClone(ALL.p2pk ?? {}) as Record<string, unknown>;
		const actions = tampered.actions as Record<string, Record<string, unknown>>;

		(actions.Pay ?? {}).on_validate = "assert!(true)";

		expect(refusalOf(tampered)?.reject).toBe("unimplemented-construct");
	});
});

describe("the version field cannot decide the generation", () => {
	test("every document in every generation declares the same format version", () => {
		const declared = new Set(Object.values(ALL).map((document) => document.manifest_version));

		expect([...declared]).toEqual(["0.1.0"]);
	});

	test("and a document is normalised without its version being consulted", () => {
		for (const [name, document] of Object.entries(ALL)) {
			const withoutVersion = { ...document };

			delete withoutVersion.manifest_version;

			expect({ [name]: normaliseManifest(withoutVersion).manifest.actions }).toEqual({
				[name]: normaliseManifest(document).manifest.actions,
			});
		}
	});
});

describe("both generations of a protocol are read the same way", () => {
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

describe("the corpus carries one reference spelling", () => {
	test("every instance reference in every document is written the canonical way", () => {
		const older = Object.entries(ALL)
			.filter(([, document]) => spellings(document).deprecated > 0)
			.map(([name]) => name)
			.toSorted();

		expect(older).toEqual([]);
	});

	test("and the namespace that was removed no longer reads as one", () => {
		expect(parseReference("compile_params.OWNER")).toMatchObject({
			attribute: "OWNER",
			form: "input-attribute",
			name: "compile_params",
		});
		expect(parseReference("instance.OWNER")).toMatchObject({ form: "instance", name: "OWNER" });
	});
});

function namesOf(document: Record<string, unknown>): string[] {
	return normalised(document)
		.actions.map((action) => action.name)
		.toSorted();
}

function unreadIn(document: Record<string, unknown>): string[] {
	return [
		...new Set(loadBearing(inspectConstructs(normalised(document))).map((found) => found.key)),
	].toSorted();
}

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

function spellings(document: Record<string, unknown>): { current: number; deprecated: number } {
	let deprecated = 0;
	let current = 0;

	for (const { at, text } of strings(document)) {
		if (at.includes("compile_params.") && !text.startsWith("compile_params.")) {
			continue;
		}

		if (text.replace(/^\$/, "").startsWith("compile_params.")) {
			deprecated += 1;

			continue;
		}

		if (parseReference(text)?.form === "instance") {
			current += 1;
		}
	}

	return { current, deprecated };
}

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
