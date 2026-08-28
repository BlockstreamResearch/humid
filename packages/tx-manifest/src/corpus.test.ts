import { describe, expect, test } from "bun:test";

import dex from "./__fixtures__/dex.manifest.json";
import lastWill from "./__fixtures__/last_will.manifest.json";
import lending from "./__fixtures__/lending.manifest.json";
import lendingV2 from "./__fixtures__/lending_v2.manifest.json";
import lendingV3 from "./__fixtures__/lending_v3.manifest.json";
import p2pkGrouped from "./__fixtures__/p2pk-grouped.manifest.json";
import p2pk from "./__fixtures__/p2pk.manifest.json";
import zeroconf from "./__fixtures__/zeroconf.manifest.json";
import { identifiedForeignAsset, refuseUnfundableAsset, statedAsset } from "./document/asset";
import { asArray, asRecord } from "./document/json";
import { findAction, normaliseManifest } from "./document/normalise";
import { refuseUnsupported } from "./document/refuse";
import { ignored, inspectConstructs, loadBearing } from "./document/registry";

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

function rejectionOf(name: keyof typeof CORPUS) {
	return refuseUnsupported(normalised(name).manifest, {
		compilerVersion: "0.6.0",
		contractSources: {},
		policyAsset: POLICY_ASSET,
	})?.reject;
}

// A refusal a site cannot tell from another refusal is a sentence, not an answer. Five of the
// seven published protocols are refused, and each has to arrive with a name a program can
// branch on beside the sentence a person reads — because "this wallet will never build that"
// and "your state file is out of date" are the same wire code and opposite advice.
describe("every refusal a published manifest earns is named, not only described", () => {
	for (const name of Object.keys(CORPUS) as (keyof typeof CORPUS)[]) {
		test(`${name} is either built or refused by a name`, () => {
			const reason = refusalFor(name);
			const reject = rejectionOf(name);

			// Exactly one of the two states, and never a sentence with no name attached.
			expect(reason === "" ? reject === undefined : typeof reject === "string").toBe(true);
		});
	}

	// The measurement this bundle exists to move. Every published protocol used to be refused on
	// a construct this wallet did not implement; then three of them were refused on the asset
	// they move. Neither holds now, and the second was never true in the first place: the asset
	// rule compared text against the network's own asset and refused anything else, and every
	// asset in this corpus is written as a lookup rather than as an id, so it refused the
	// spelling of a question the document had not answered yet. See the asset describe below.
	//
	// What is left is one statement about the wallet rather than about its reading: the oldest
	// lending generation asks for a witness it cannot produce.
	test("and no published manifest is refused for a construct any more", () => {
		const named = Object.fromEntries(
			(Object.keys(CORPUS) as (keyof typeof CORPUS)[]).map((name) => [name, rejectionOf(name)]),
		);

		expect(named).toEqual({
			dex: undefined,
			last_will: undefined,
			lending: "unproducible-witness",
			lending_v2: undefined,
			lending_v3: undefined,
			p2pk: undefined,
			zeroconf: undefined,
		});
	});
});

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

	// Recorded as the measurement rather than as an expectation. One protocol is still refused
	// from its document alone, and what stops it is the witness it asks for rather than a part
	// of the document this wallet had not read.
	test("lending refuses, on the witness it asks for and not on a construct", () => {
		expect(refusalFor("lending")).toContain("witness");
	});

	// The three that used to be refused on the asset they move. Named rather than counted: each
	// is a protocol whose document this wallet now reads to the end, and a document dropping
	// back out of this list is the asset rule reading a lookup as an id again.
	test.each([["dex"], ["lending_v2"], ["lending_v3"]])(
		"%s is read to the end, where its asset used to stop it",
		(name) => {
			expect(refusalFor(name)).toBe("");
		},
	);

	test("last_will is read and built, where it was refused before this bundle", () => {
		expect(refusalFor("last_will")).toBe("");
	});

	// A refusal still names where it was. Nothing in the corpus earns one from its document
	// alone any more, so this exercises the sentence on a document written to earn it.
	test("and a refusal names where it was, not just what it was", () => {
		const { manifest } = normaliseManifest({
			actions: { Spend: { inputs: [{ id: "vault_in", utxo_source: "wallet", unheard_of: 1 }] } },
			chain: "liquid",
		});
		const refusal = refuseUnsupported(manifest, {
			compilerVersion: "0.6.0",
			contractSources: {},
			policyAsset: POLICY_ASSET,
		});

		expect(refusal?.reason).toContain("action Spend / input vault_in");
	});
});

// AC-06. The rule that used to refuse three of these protocols, and the rule that replaced it.
//
// The old check asked whether an action's asset text was the network's own and refused every
// other string. That is the same question as "does this move an asset this wallet cannot move"
// only when a document writes its assets as ids — and these documents do not. So the check was
// answering about the spelling, and its verdict on real money was never reached.
//
// These record the corpus fact the rule turned on, and where the protection went instead.
describe("the asset a document states, and the asset it defers", () => {
	/** Every asset text a protocol declares, at an input or an output. */
	function declaredAssets(name: string): string[] {
		const found: string[] = [];

		for (const action of normalised(name).manifest.actions) {
			for (const kind of ["inputs", "outputs"] as const) {
				for (const entry of asArray(action.node[kind])) {
					const asset = asRecord(entry)?.asset;

					if (typeof asset === "string") {
						found.push(asset);
					}
				}
			}
		}

		return found;
	}

	// The fact the old rule broke on. Every asset in every published protocol is either the
	// network's own or a lookup resolved against a file the document does not carry. Not one is
	// an id, so a rule refusing "anything that is not the network's asset" refused a lookup
	// every single time it fired.
	test("no published protocol writes an asset as an id, anywhere", () => {
		const kinds = new Set(
			Object.keys(CORPUS).flatMap((name) =>
				declaredAssets(name).map((asset) => statedAsset(asset, POLICY_ASSET).kind),
			),
		);

		expect([...kinds].toSorted()).toEqual(["deferred", "network"]);
	});

	// And so nothing in the corpus earns the document-level refusal, which is what changed.
	test("and so none of them names an asset this wallet cannot move", () => {
		const named = Object.fromEntries(
			Object.keys(CORPUS).map((name) => [
				name,
				normalised(name)
					.manifest.actions.map((action) => identifiedForeignAsset(action, POLICY_ASSET))
					.find((found) => found !== undefined),
			]),
		);

		expect(Object.values(named).every((found) => found === undefined)).toBe(true);
	});

	// The refusal was moved rather than dropped. A document that does commit to an asset still
	// earns it from the document alone — written here rather than found in the corpus, because
	// the corpus contains no such document, which is the whole point above.
	test("a document that does name a foreign asset is still refused, from the document alone", () => {
		const { manifest } = normaliseManifest({
			actions: {
				Move: {
					outputs: [
						{
							amount_sat: 1000,
							asset: "feb3d9c9f2a9aaab816c2e93cfd4479f841b8e05596b8418ed0fd56e0b8d2e6d",
							destination: "wallet",
							id: "out_one",
						},
					],
				},
			},
			chain: "liquid",
		});
		const refusal = refuseUnsupported(manifest, {
			compilerVersion: "0.6.0",
			contractSources: {},
			policyAsset: POLICY_ASSET,
		});

		expect(refusal?.reject).toBe("foreign-asset");
	});

	// Where the protection went. lending_v3 states its assets as lookups into a deployment, so
	// the document cannot say what they are — but once a deployment supplies them, this wallet
	// still will not fund an action in an asset it does not hold, and says so by name.
	test("and lending_v3 is still refused once its lookups resolve to an asset this wallet lacks", () => {
		const action = findAction(normalised("lending_v3").manifest, "CreateFactory");

		if (!action) {
			throw new Error("lending_v3 declares no CreateFactory action");
		}

		const refusal = refuseUnfundableAsset(action, POLICY_ASSET, {
			instance: {
				BORROWER_NFT_ASSET_ID: "feb3d9c9f2a9aaab816c2e93cfd4479f841b8e05596b8418ed0fd56e0b8d2e6d",
				COLLATERAL_ASSET_ID: "feb3d9c9f2a9aaab816c2e93cfd4479f841b8e05596b8418ed0fd56e0b8d2e6d",
				FACTORY_ASSET_ID: "feb3d9c9f2a9aaab816c2e93cfd4479f841b8e05596b8418ed0fd56e0b8d2e6d",
				LENDER_NFT_ASSET_ID: "feb3d9c9f2a9aaab816c2e93cfd4479f841b8e05596b8418ed0fd56e0b8d2e6d",
				PRINCIPAL_ASSET_ID: "feb3d9c9f2a9aaab816c2e93cfd4479f841b8e05596b8418ed0fd56e0b8d2e6d",
			},
			params: {},
		});

		expect(refusal).toContain("funds an action only in the network's own asset");
	});

	// And the same action is fundable when the deployment's assets are the network's own, which
	// is what makes the check above a check rather than a second blanket refusal.
	test("and it is not refused when those same lookups resolve to the network's own asset", () => {
		const action = findAction(normalised("lending_v3").manifest, "CreateFactory");

		if (!action) {
			throw new Error("lending_v3 declares no CreateFactory action");
		}

		const refusal = refuseUnfundableAsset(action, POLICY_ASSET, {
			instance: {
				BORROWER_NFT_ASSET_ID: POLICY_ASSET,
				COLLATERAL_ASSET_ID: POLICY_ASSET,
				FACTORY_ASSET_ID: POLICY_ASSET,
				LENDER_NFT_ASSET_ID: POLICY_ASSET,
				PRINCIPAL_ASSET_ID: POLICY_ASSET,
			},
			params: {},
		});

		expect(refusal).toBeUndefined();
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

		// Empty, which is what this bundle set out to make true: every construct the published
		// corpus uses is now one this wallet reads.
		expect([...unread].toSorted()).toEqual([]);
	});
});
