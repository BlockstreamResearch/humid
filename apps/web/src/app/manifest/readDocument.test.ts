import { describe, expect, test } from "bun:test";

import dexManifest from "@humid/tx-manifest/fixtures/current/dex.manifest.json";
import lastWillManifest from "@humid/tx-manifest/fixtures/current/last_will.manifest.json";
import lendingV2Manifest from "@humid/tx-manifest/fixtures/current/lending_v2.manifest.json";
import lendingV3Manifest from "@humid/tx-manifest/fixtures/current/lending_v3.manifest.json";
import zeroconfManifest from "@humid/tx-manifest/fixtures/current/zeroconf.manifest.json";

import { LIQUID_MAINNET, LIQUID_TESTNET } from "@/lib/liquid-networks";

import { readDocument } from "./readDocument";

// The page's own half of AC-07. The package decides whether parsed JSON is a document; this
// decides what happens to text that never became JSON, which is most of what a person pastes.
// The two failures need different sentences — a truncated document is a syntax problem and
// the wrong file is not — so the split is tested rather than assumed.

describe("what the textarea currently holds", () => {
	test("an empty box is not a fault to report", () => {
		expect(readDocument("").kind).toBe("empty");
	});

	test("whitespace alone is still an empty box", () => {
		expect(readDocument("   \n\t ").kind).toBe("empty");
	});

	test("text that never became JSON is unreadable, and says why", () => {
		const result = readDocument("{ actions: }");

		expect(result.kind).toBe("unreadable");
		expect(result.kind === "unreadable" && result.reason.length).toBeGreaterThan(0);
	});

	test("JSON that is not a document is read, and refused as one", () => {
		const result = readDocument('"a string"');

		expect(result.kind).toBe("read");
		expect(result.kind === "read" && result.ok).toBe(false);
	});

	test("a document is read, and carries all three answers", () => {
		const result = readDocument('{ "compose_version": "1.0", "chain": "liquid" }');

		expect(result.kind).toBe("read");

		if (result.kind !== "read" || !result.ok) {
			throw new Error("expected a readable document");
		}

		expect(result.rewrites).toHaveLength(1);
		expect(result.constructs.length).toBeGreaterThan(0);
		// A count rather than a list, so a refusal that stops needing more than the document —
		// or a new one that does — fails here and gets looked at. The tenth is the stated
		// transaction position, which needs a transaction to be unbuildable in; the eleventh is
		// the signing module disagreeing with the wallet, which needs one to have been built.
		expect(result.unreachable).toHaveLength(11);
		expect(result.unreachable).toContain("unbuildable-position");
		expect(result.unreachable).toContain("built-something-else");
	});

	test("never asks for the checks it holds no values for", () => {
		const result = readDocument('{ "chain": "liquid" }');

		if (result.kind !== "read" || !result.ok) {
			throw new Error("expected a readable document");
		}

		// The page ships no compiler version and no policy asset, and reports that rather than
		// supplying a stand-in — which would turn "not checked" into "checked and fine".
		expect(result.skipped).toEqual(["foreign-compiler", "foreign-asset", "unbuildable-utxo-type"]);
	});
});

// AC-01 and AC-03. The asset checks are the two the wallet already refuses published protocols
// on, so what matters is not that a value arrives but that the same documents come back refused
// here as there — and that no network still means no answer rather than a passing one.

describe("the two checks that need the network's own asset", () => {
	function read(manifest: unknown, network?: typeof LIQUID_MAINNET) {
		const result = readDocument(JSON.stringify(manifest), { network });

		if (result.kind !== "read" || !result.ok) {
			throw new Error("expected a readable document");
		}

		return result;
	}

	test("with no network chosen, both stay reported as not run", () => {
		const result = read(dexManifest);

		expect(result.skipped).toContain("foreign-asset");
		expect(result.skipped).toContain("unbuildable-utxo-type");
		expect(result.refusal).toBeUndefined();
	});

	test("with a network chosen, neither is reported as not run any more", () => {
		const result = read(zeroconfManifest, LIQUID_MAINNET);

		// The compiler check still is; this page holds no version yet.
		expect(result.skipped).toEqual(["foreign-compiler"]);
	});

	// The three the wallet refuses on the asset they move. Named rather than counted: a document
	// dropping out of this list is the page and the wallet disagreeing again, which is the whole
	// failure this page exists to prevent.
	test.each([
		["dex", dexManifest],
		["lending_v2", lendingV2Manifest],
		["lending_v3", lendingV3Manifest],
	])("%s is refused on the asset it moves", (_name, manifest) => {
		expect(read(manifest, LIQUID_MAINNET).refusal?.reject).toBe("foreign-asset");
	});

	test.each([
		["last_will", lastWillManifest],
		["zeroconf", zeroconfManifest],
	])("%s is not refused, and is not claimed to be unchecked either", (_name, manifest) => {
		const result = read(manifest, LIQUID_MAINNET);

		expect(result.refusal).toBeUndefined();
		expect(result.skipped).not.toContain("foreign-asset");
	});

	// Both networks carry a different asset and the answer happens to be the same, because these
	// documents name assets no Liquid network charges in. Asserted so that stops being invisible
	// if it ever changes.
	test("testnet reaches the same verdict as mainnet on the published corpus", () => {
		expect(read(dexManifest, LIQUID_TESTNET).refusal?.reject).toBe("foreign-asset");
		expect(read(lastWillManifest, LIQUID_TESTNET).refusal).toBeUndefined();
	});
});
