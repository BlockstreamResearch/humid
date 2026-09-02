import { describe, expect, test } from "bun:test";

import { SMPLX_COMPILER_VERSION } from "@humid/smplx-compiler";
import dexManifest from "@humid/tx-manifest/fixtures/current/dex.manifest.json";
import lastWillManifest from "@humid/tx-manifest/fixtures/current/last_will.manifest.json";
import lendingV2Manifest from "@humid/tx-manifest/fixtures/current/lending_v2.manifest.json";
import lendingV3Manifest from "@humid/tx-manifest/fixtures/current/lending_v3.manifest.json";
import zeroconfManifest from "@humid/tx-manifest/fixtures/current/zeroconf.manifest.json";

import { readDocument } from "./readDocument";

// The page's own half of the reading. The package decides whether parsed JSON is a document;
// this decides what happens to text that never became JSON, which is most of what a person
// pastes. The two failures need different sentences — a truncated document is a syntax problem
// and the wrong file is not — so the split is tested rather than assumed.

function read(text: string, options?: Parameters<typeof readDocument>[1]) {
	const result = readDocument(text, options);

	if (result.kind !== "read" || !result.ok) {
		throw new Error("expected a readable document");
	}

	return result;
}

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

	test("a document is read, and carries every answer the page draws", () => {
		const result = read('{ "compose_version": "1.0", "chain": "liquid" }');

		expect(result.rewrites).toHaveLength(1);
		expect(result.constructs.length).toBeGreaterThan(0);
		// A count rather than a list, so a refusal that stops needing more than the document — or
		// a new one that does — fails here and gets looked at.
		expect(result.unreachable).toHaveLength(12);
		expect(result.unreachable).toContain("unbuildable-position");
		expect(result.unreachable).toContain("built-something-else");
		// Which asset a document means is resolved against a deployment and a request, and what
		// this wallet does about one is a question about a balance. Neither is on this page.
		expect(result.unreachable).toContain("foreign-asset");
	});

	// The compiler version is no longer something this page waits to be told. It reads the one
	// constant this repository ships, which is the one the extension reads, so the check runs
	// on a document that references no contracts rather than being reported as unrun.
	test("answers the compiler check from the version this repository ships", () => {
		const result = read('{ "chain": "liquid" }');

		expect(result.skipped).toEqual([]);
		expect(result.partial).toEqual([]);
	});
});

// The compiler check is the one thing on this page a person can complete, and it is declared in
// two places: the document, and a directive inside each contract source.
describe("the compiler check, which is declared in two places", () => {
	const document = JSON.stringify(lastWillManifest);

	test("names the contract sources the document references, supplied or not", () => {
		expect(read(document).contracts).toEqual(["./last_will.simf"]);
	});

	test("with no sources, says the contracts went unread", () => {
		const result = read(document);

		expect(result.skipped).not.toContain("foreign-compiler");
		expect(result.partial).toEqual([{ reject: "foreign-compiler", unread: ["./last_will.simf"] }]);
	});

	test("with every referenced source supplied, the check is answered in full", () => {
		const result = read(document, {
			contractSources: { "./last_will.simf": "fn main() {}" },
		});

		expect(result.partial).toEqual([]);
		expect(result.refusal).toBeUndefined();
	});

	test("refuses a source asking for a version the reader was told it does not have", () => {
		const result = read(document, {
			contractSources: { "./last_will.simf": 'simc "9.9.9"\nfn main() {}' },
		});

		expect(result.refusal?.reject).toBe("foreign-compiler");
		expect(result.refusal?.reason).toContain("./last_will.simf");
		// The version this page and the wallet both read, rather than one a person typed.
		expect(result.refusal?.reason).toContain(SMPLX_COMPILER_VERSION);
	});

	test("a source asking for the version it was told about is not refused", () => {
		const result = read(document, {
			contractSources: {
				"./last_will.simf": `simc "${SMPLX_COMPILER_VERSION}"\nfn main() {}`,
			},
		});

		expect(result.refusal).toBeUndefined();
		expect(result.partial).toEqual([]);
	});
});

// The corpus this runtime is built against, read through the page rather than through the
// package. A document dropping out of this list is the page and the wallet disagreeing, which
// is the whole failure this page exists to prevent.
describe("the published protocols, read by the page", () => {
	test.each([
		["dex", dexManifest],
		["last_will", lastWillManifest],
		["lending_v2", lendingV2Manifest],
		["lending_v3", lendingV3Manifest],
		["zeroconf", zeroconfManifest],
	])("%s is not refused by anything a document alone can decide", (_name, manifest) => {
		expect(read(JSON.stringify(manifest)).refusal).toBeUndefined();
	});

	// And that is not the same as the wallet building any of them. Every one of these still has
	// twelve refusals ahead of it that no reading of a document can reach.
	test.each([
		["dex", dexManifest],
		["lending_v3", lendingV3Manifest],
	])("%s still carries every check no document can answer", (_name, manifest) => {
		expect(read(JSON.stringify(manifest)).unreachable).toHaveLength(12);
	});
});
