import { describe, expect, test } from "bun:test";

import flatManifest from "../__fixtures__/p2pk.manifest.json";
import { inspectManifestDocument } from "./inspect";
import type { ConstructState } from "./registry";

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

describe("what an older spelling was rewritten to", () => {
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

	test("refuses a build mode that is neither on nor off, which the review also refuses", () => {
		expect(inspect({ compile_debug_symbols: "yes" }).refusal?.reject).toBe("unreadable-build-mode");
	});

	test("always names the refusals no reading of a document can reach", () => {
		const { unreachable } = inspect(flat);

		expect(unreachable).toContain("covenant-mismatch");
		expect(unreachable).toContain("shortfall");
		expect(unreachable).toContain("no-fee-rate");
		expect(unreachable).toContain("foreign-asset");
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

describe("the contracts the document references", () => {
	test("names them under the paths the document itself uses", () => {
		expect(inspect(flat).contracts).toEqual(["./p2pk.simf"]);
	});

	test("a document declaring no covenants references nothing", () => {
		expect(inspect({ chain: "liquid" }).contracts).toEqual([]);
	});
});

describe("what it does not do", () => {
	test("leaves the document it was given untouched", () => {
		const document = { actions: { Pay: { deploy: true } } };
		const before = JSON.stringify(document);

		inspectManifestDocument(document);

		expect(JSON.stringify(document)).toBe(before);
	});

	test("returns the same answer for the same document, twice", () => {
		expect(JSON.stringify(inspect(flat))).toBe(JSON.stringify(inspect(flat)));
	});
});
