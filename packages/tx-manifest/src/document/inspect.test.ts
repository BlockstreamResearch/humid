import { describe, expect, test } from "bun:test";

import flatManifest from "../__fixtures__/p2pk.manifest.json";
import { inspectManifestDocument } from "./inspect";
import type { ConstructState } from "./registry";

// Expectations come from what this surface exists to guarantee, not from what the readers
// behind it happen to return. The sharpest is that the absence of a refusal must never be
// readable as a promise that a wallet would build the action: most of this runtime's refusals
// cannot be decided from a document at all.

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

// A person pastes text, so most of what arrives is not a manifest.
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

// Four states plus the fifth no criterion counts: a key no site lists.
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

	test("carries the kind of position, so two reports can be told apart by program", () => {
		const report = inspect({ actions: { Pay: { args: {} } } }).constructs.find(
			(entry) => entry.key === "args",
		);

		expect(report?.site).toBe("action");
	});

	test("reports handled constructs too, which the refusal reader does not", () => {
		expect(inspect(flat).constructs.some((report) => report.state === "acted-on")).toBe(true);
	});
});

// A rewrite is a document from an older generation of the format, and saying so is the point:
// silently accepting one hides that the format moved.
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

// The refusal is only ever half the answer, and the half that is missing has to arrive with it.
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

	// The mode is read by the normaliser and refused on by the review once it has found an
	// action. Nothing about that reading needs an action, so a document stating it unreadably is
	// refused here too — otherwise this page calls clean a document the wallet turns away.
	test("refuses a build mode that is neither on nor off, which the review also refuses", () => {
		expect(inspect({ compile_debug_symbols: "yes" }).refusal?.reject).toBe("unreadable-build-mode");
	});

	test("always names the refusals no reading of a document can reach", () => {
		const { unreachable } = inspect(flat);

		expect(unreachable).toContain("covenant-mismatch");
		expect(unreachable).toContain("shortfall");
		expect(unreachable).toContain("no-fee-rate");
		// Which asset a document means is a lookup resolved against a deployment and a request,
		// and what this wallet does about one is a question about a balance. Neither is in the
		// document, so the refusal that names an asset is not decidable here.
		expect(unreachable).toContain("foreign-asset");
		// The signing module disagreeing with the wallet is decided after a transaction has been
		// built, which is further from a document than any of the others here.
		expect(unreachable).toContain("built-something-else");
		expect(unreachable).toHaveLength(12);
	});

	test("names the reachable checks it could not perform, rather than passing them", () => {
		expect(inspect(flat).skipped).toEqual(["foreign-compiler"]);
	});

	test("skips nothing once the caller supplies what that check needs", () => {
		const result = inspect(flat, { compilerVersion: "0.4.0" });

		expect(result.skipped).toEqual([]);
	});

	test("refuses a compiler it does not have, once it has been told which it has", () => {
		const result = inspect({ simplicity_hl_version: "9.9.9" }, { compilerVersion: "0.4.0" });

		expect(result.refusal?.reject).toBe("foreign-compiler");
	});

	test("does not refuse a compiler it was never told about", () => {
		expect(inspect({ simplicity_hl_version: "9.9.9" }).refusal).toBeUndefined();
	});
});

// A compiler version is declared twice — once by the document and once by a directive inside
// each contract source — so a reader given only the version has answered one of the two. That
// is neither skipped nor done, and reporting it as either is this surface's own failure mode
// happening one level down.
describe("a check that read one of the two places that decide it", () => {
	test("names the sources it did not read, and does not call the check skipped", () => {
		const result = inspect(flat, { compilerVersion: "0.4.0" });

		expect(result.skipped).not.toContain("foreign-compiler");
		expect(result.partial).toEqual([{ reject: "foreign-compiler", unread: ["./p2pk.simf"] }]);
	});

	test("is answered in full once every source the document references arrives", () => {
		const result = inspect(flat, {
			compilerVersion: "0.4.0",
			contractSources: { "./p2pk.simf": "fn main() {}" },
		});

		expect(result.partial).toEqual([]);
		expect(result.skipped).not.toContain("foreign-compiler");
	});

	test("a document referencing no contracts is answered in full by the version alone", () => {
		expect(inspect({ chain: "liquid" }, { compilerVersion: "0.4.0" }).partial).toEqual([]);
	});

	test("with no version at all the check is skipped, which is not the same thing", () => {
		const result = inspect(flat);

		expect(result.skipped).toContain("foreign-compiler");
		expect(result.partial).toEqual([]);
	});

	test("refuses a source asking for another compiler, naming the file it arrived under", () => {
		const result = inspect(flat, {
			compilerVersion: "0.4.0",
			contractSources: { "./p2pk.simf": 'simc "9.9.9"\nfn main() {}' },
		});

		expect(result.refusal?.reject).toBe("foreign-compiler");
		expect(result.refusal?.reason).toContain("./p2pk.simf");
	});
});

// The contracts a document names are what a caller holding files has to be told before it can
// hand any of them over.
describe("the contracts the document references", () => {
	test("names them under the paths the document itself uses", () => {
		expect(inspect(flat).contracts).toEqual(["./p2pk.simf"]);
	});

	test("a document declaring no covenants references nothing", () => {
		expect(inspect({ chain: "liquid" }).contracts).toEqual([]);
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
