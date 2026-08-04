import { describe, expect, test } from "bun:test";

import dex from "./__fixtures__/dex.manifest.json";
import lastWill from "./__fixtures__/last_will.manifest.json";
import lending from "./__fixtures__/lending.manifest.json";
import lendingV2 from "./__fixtures__/lending_v2.manifest.json";
import lendingV3 from "./__fixtures__/lending_v3.manifest.json";
import p2pkGrouped from "./__fixtures__/p2pk-grouped.manifest.json";
import p2pk from "./__fixtures__/p2pk.manifest.json";
import zeroconf from "./__fixtures__/zeroconf.manifest.json";
import { findAction, normaliseManifest } from "./normalise";
import { refuseUnsupported } from "./refuse";
import { ignored, inspectConstructs, loadBearing } from "./registry";

// The seven published manifests, vendored byte for byte from txmanifest-wallet at
// 7d56516a1a1e44a586f25d45a34619c3953758dd. They are the only thing that can answer what
// this wallet actually does with real documents rather than with ones written to suit it,
// and three generations of the lending protocol coexist in them — which is the point, since
// the format changed faster than its own specification.

const POLICY_ASSET = "144c654344aa716d6f3abcc1ca90e5641e4e2a7f633bc09fe3baf64585819a49";

const CORPUS = {
	dex,
	last_will: lastWill,
	lending,
	lending_v2: lendingV2,
	lending_v3: lendingV3,
	p2pk,
	zeroconf,
} as unknown as Record<string, Record<string, unknown>>;

function normalised(name: string) {
	return normaliseManifest(CORPUS[name]!);
}

function refusalFor(name: string): string {
	const refusal = refuseUnsupported(normalised(name).manifest, {
		compilerVersion: "0.6.0",
		contractSources: {},
		policyAsset: POLICY_ASSET,
	});

	return refusal ? refusal.reason : "";
}

describe("every published manifest is read", () => {
	for (const name of Object.keys(CORPUS)) {
		test(`${name} normalises without throwing`, () => {
			expect(() => normalised(name)).not.toThrow();
		});
	}

	// The action counts are the documents' own. A runtime that read only one declaration
	// shape would find none in five of these seven.
	test("and its actions are found, in whichever shape it declared them", () => {
		const counts = Object.fromEntries(
			Object.keys(CORPUS).map((name) => [name, normalised(name).manifest.actions.length]),
		);

		expect(counts).toEqual({
			dex: 4,
			last_will: 4,
			lending: 10,
			lending_v2: 9,
			lending_v3: 6,
			p2pk: 2,
			zeroconf: 0,
		});
	});

	test("each by name", () => {
		const { manifest } = normalised("lending_v3");

		for (const action of manifest.actions) {
			expect(findAction(manifest, action.name)?.name).toBe(action.name);
		}
	});

	// A valid manifest that does nothing. It exists in the corpus and a runtime that assumes
	// every manifest has something in it falls over on the smallest real document there is.
	test("including the one that declares nothing at all", () => {
		const { manifest } = normalised("zeroconf");

		expect(manifest.actions).toEqual([]);
		expect(manifest.utxoTypes).toEqual({});
	});
});

// AC-10 across generations. Five of the seven declare their actions as methods inside
// classes; p2pk declares them flat; lending and lending_v2 carry both shapes in one document.
describe("both declaration shapes, in the documents that actually use them", () => {
	test("a grouped manifest's methods are actions", () => {
		expect(normalised("dex").manifest.actions.map((action) => action.boundTo)).toEqual([
			"tessera_offer_contract",
			"tessera_offer_contract",
			"tessera_offer_contract",
			"tessera_offer_contract",
		]);
	});

	test("a flat manifest's are too, bound to nothing", () => {
		expect(normalised("p2pk").manifest.actions.every((action) => !action.boundTo)).toBe(true);
	});

	// lending declares two flat actions and eight class methods in one document, which is the
	// case a runtime handling only one shape would half-read without failing.
	test("and a document carrying both is read whole", () => {
		const bound = normalised("lending").manifest.actions.filter((action) => action.boundTo);

		expect(bound).toHaveLength(8);
		expect(normalised("lending").manifest.actions).toHaveLength(10);
	});

	test("the two spellings of one protocol converge", () => {
		const flat = normaliseManifest(p2pk as unknown as Record<string, unknown>).manifest.actions;
		const grouped = normaliseManifest(p2pkGrouped as unknown as Record<string, unknown>).manifest
			.actions;

		expect(grouped.map(({ boundTo: _boundTo, ...rest }) => rest)).toEqual(
			flat.map(({ boundTo: _boundTo, ...rest }) => rest),
		);
	});
});

// AC-02 across the corpus, and the measurement this issue exists to take: what this wallet
// can act on today, and what it refuses. A construct the runtime does not read is a refusal
// by name rather than a signature over something unparsed — but a refusal is still a
// protocol this wallet cannot perform.
describe("what this wallet can do with each published protocol", () => {
	test("p2pk builds", () => {
		expect(refusalFor("p2pk")).toBe("");
	});

	test("zeroconf builds, having nothing to build", () => {
		expect(refusalFor("zeroconf")).toBe("");
	});

	// Recorded as the measurement rather than as an expectation: these five refuse today, and
	// the first construct each refuses on is what a slice implementing it would remove.
	test.each([
		["dex", "is_constructor"],
		["last_will", "is_constructor"],
		["lending", "confidential"],
		["lending_v2", "confidential"],
		["lending_v3", "is_constructor"],
	])("%s refuses, on %s", (name, construct) => {
		expect(refusalFor(name)).toContain(construct);
	});

	test("and every refusal names where it was, not just what it was", () => {
		expect(refusalFor("lending")).toContain("action PrepareLender");
	});
});

// AC-02's decorative half across the corpus: what is ignored is reported as ignored.
describe("what each protocol says that this wallet reads past", () => {
	test("p2pk's attestation_version, which no implementation reads", () => {
		const keys = ignored(inspectConstructs(normalised("p2pk").manifest)).map((f) => f.key);

		expect(keys).toContain("attestation_version");
	});

	test("and lending_v3's display metadata, which is the protocol's own text", () => {
		const findings = ignored(inspectConstructs(normalised("lending_v3").manifest));

		expect(findings.length).toBeGreaterThan(0);
	});

	test("nothing load-bearing is ever in the ignored list", () => {
		for (const name of Object.keys(CORPUS)) {
			const findings = inspectConstructs(normalised(name).manifest);
			const overlap = ignored(findings).filter((finding) => finding.loadBearing);

			expect(overlap).toEqual([]);
		}
	});
});

// The coverage table, asserted so it cannot drift silently. Every one of these is a
// construct real protocols use and this wallet does not read; a slice that implements one
// has to change this list, which is the point of writing it down.
describe("what the corpus uses and this wallet does not read", () => {
	test("the whole list, across all seven", () => {
		const unread = new Set<string>();

		for (const name of Object.keys(CORPUS)) {
			for (const finding of loadBearing(inspectConstructs(normalised(name).manifest))) {
				unread.add(finding.key);
			}
		}

		expect([...unread].sort()).toEqual([
			"confidential",
			"create_instance",
			"default",
			"is_constructor",
			"issuance",
			"on_pre_broadcast",
			"on_resolved",
			"required_index",
			"simplicity_type",
			"source",
			"value",
		]);
	});
});
