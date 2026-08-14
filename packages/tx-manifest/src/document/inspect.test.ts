import { describe, expect, test } from "bun:test";

import flatManifest from "../__fixtures__/p2pk.manifest.json";
import { inspectManifestDocument } from "./inspect";
import type { ConstructState } from "./registry";

// Expectations come from the criteria this surface exists to meet, not from what the readers
// behind it happen to return. The sharpest is AC-04: the absence of a refusal must never be
// readable as a promise that a wallet would build the action, because only eight of the
// seventeen refusals can be decided from a document at all.

const flat = flatManifest as unknown as Record<string, unknown>;

function inspect(document: unknown, options = {}) {
	const result = inspectManifestDocument(document, options);

	if (!result.ok) {
		throw new Error(`expected a readable document, got: ${result.reason}`);
	}

	return result;
}

function stateOf(document: unknown, key: string): ConstructState | undefined {
	return inspect(document).constructs.find((report) => report.key === key)?.state;
}

// AC-07. A person pastes text, so most of what arrives is not a manifest.
describe("a document it cannot read", () => {
	test("says so for text that parsed to a string", () => {
		const result = inspectManifestDocument("not a manifest");

		expect(result.ok).toBe(false);
		expect(result.ok === false && result.reason).toContain("a string");
	});

	test("distinguishes an array, which is JSON and is not a manifest", () => {
		const result = inspectManifestDocument([{ actions: {} }]);

		expect(result.ok).toBe(false);
		expect(result.ok === false && result.reason).toContain("array");
	});

	test("says null rather than an object, which is what typeof would have called it", () => {
		const result = inspectManifestDocument(null);

		expect(result.ok).toBe(false);
		expect(result.ok === false && result.reason).toContain("null");
	});

	test("reads an empty object, which is a document that declares nothing", () => {
		expect(inspect({}).constructs).toEqual([]);
	});
});

// AC-03. Four states plus the fifth the criterion did not count: a key no site lists.
describe("what each declared construct is", () => {
	test("a construct that decides what gets signed is acted on", () => {
		expect(stateOf(flat, "utxo_types")).toBe("acted-on");
	});

	test("a description is shown to a person and decides nothing", () => {
		expect(stateOf(flat, "description")).toBe("shown");
	});

	test("a construct the format defines and this runtime does not is unimplemented", () => {
		expect(stateOf({ actions: { Pay: { args: { a: 1 } } } }, "args")).toBe("unimplemented");
	});

	test("a construct known and deliberately read by nothing is never-read", () => {
		expect(stateOf(flat, "attestation_version")).toBe("never-read");
	});

	test("a construct no site lists is unrecognised, which is not one of the four", () => {
		expect(stateOf({ nobody_has_ever_seen_this: 1 }, "nobody_has_ever_seen_this")).toBe(
			"unrecognised",
		);
	});

	test("names the position in the document's own terms, not as a path", () => {
		const report = inspect({ actions: { Pay: { args: {} } } }).constructs.find(
			(entry) => entry.key === "args",
		);

		expect(report?.at).toBe("action Pay");
	});

	test("reports handled constructs too, which the refusal reader does not", () => {
		expect(inspect(flat).constructs.some((report) => report.state === "acted-on")).toBe(true);
	});
});

// AC-02. A rewrite is a document from an older generation of the format, and saying so is the
// point: silently accepting one hides that the format moved.
describe("what an older spelling was rewritten to", () => {
	test("reports the rename with where it was found and both names", () => {
		const [rewrite] = inspect({ compose_version: "1.0" }).rewrites;

		expect(rewrite).toEqual({
			at: "manifest",
			canonical: "manifest_version",
			found: "compose_version",
		});
	});

	test("reports a rename inside an action against that action", () => {
		const rewrite = inspect({ actions: { Pay: { deploy: true } } }).rewrites.find(
			(note) => note.canonical === "is_constructor",
		);

		expect(rewrite?.at).toBe("action Pay");
		expect(rewrite?.found).toBe("deploy");
	});

	test("a document in the current spelling reports no rewrites at all", () => {
		expect(inspect({ manifest_version: "1.0" }).rewrites).toEqual([]);
	});
});

// AC-04 and AC-05 together. The refusal is only ever half the answer, and the half that is
// missing has to arrive with it.
describe("what it would refuse on, and what it never asked", () => {
	test("reports the first refusal with its stable token", () => {
		const result = inspect({ chain: "bitcoin" });

		expect(result.refusal?.reject).toBe("foreign-chain");
		expect(result.refusal?.reason).toContain("bitcoin");
	});

	test("a construct nobody lists refuses as unrecognised rather than unimplemented", () => {
		expect(inspect({ nobody_has_ever_seen_this: 1 }).refusal?.reject).toBe(
			"unrecognised-construct",
		);
	});

	test("always names the refusals no reading of a document can reach", () => {
		const { unreachable } = inspect(flat);

		expect(unreachable).toContain("covenant-mismatch");
		expect(unreachable).toContain("shortfall");
		expect(unreachable).toContain("no-fee-rate");
		// The signing module disagreeing with the wallet is decided after a transaction has
		// been built, which is further from a document than any of the others here.
		expect(unreachable).toContain("built-something-else");
		expect(unreachable).toHaveLength(11);
	});

	test("names the reachable checks it could not perform, rather than passing them", () => {
		expect(inspect(flat).skipped).toEqual([
			"foreign-compiler",
			"foreign-asset",
			"unbuildable-utxo-type",
		]);
	});

	test("skips nothing once the caller supplies what those checks need", () => {
		const result = inspect(flat, { compilerVersion: "0.4.0", policyAsset: "lbtc" });

		expect(result.skipped).toEqual([]);
	});

	test("refuses a compiler it does not have, once it has been told which it has", () => {
		const result = inspect(
			{ simplicity_hl_version: "9.9.9" },
			{ compilerVersion: "0.4.0", policyAsset: "lbtc" },
		);

		expect(result.refusal?.reject).toBe("foreign-compiler");
	});

	test("does not refuse a compiler it was never told about", () => {
		expect(inspect({ simplicity_hl_version: "9.9.9" }).refusal).toBeUndefined();
	});
});

// The reason this is a package function rather than a page: the page must not be able to
// reach a network, and neither must this.
describe("what it does not do", () => {
	test("leaves the document it was given untouched", () => {
		const document = { actions: { Pay: { deploy: true } }, compose_version: "1.0" };
		const before = JSON.stringify(document);

		inspectManifestDocument(document);

		expect(JSON.stringify(document)).toBe(before);
	});

	test("returns the same answer for the same document, twice", () => {
		expect(JSON.stringify(inspect(flat))).toBe(JSON.stringify(inspect(flat)));
	});
});
