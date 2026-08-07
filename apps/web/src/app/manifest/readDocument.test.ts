import { describe, expect, test } from "bun:test";

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
		expect(result.unreachable).toHaveLength(9);
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
