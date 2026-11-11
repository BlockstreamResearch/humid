import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

import { SMPLX_COMPILER_VERSION } from "../../smplx-compiler/src/compilerVersion";
import { Manifest } from "./document/manifest";
import { refuseUnsupported, satisfies } from "./document/refuse";

const EXAMPLES = ["dex", "last_will", "lending_v2", "lending_v3", "p2pk"];

function example(name: string) {
	const at = new URL(`./__fixtures__/${name}/`, import.meta.url);
	const raw = JSON.parse(readFileSync(new URL("txmanifest.json", at), "utf8"));
	const contractSources: Record<string, string> = {};

	for (const declared of Object.values<{ script?: { source?: string } }>(raw.utxo_types)) {
		const path = declared.script?.source;

		if (path && existsSync(new URL(path, at))) {
			contractSources[path] = readFileSync(new URL(path, at), "utf8");
		}
	}

	return { contractSources, manifest: new Manifest(raw), raw };
}

function outcome(name: string) {
	const { contractSources, manifest } = example(name);

	return (
		refuseUnsupported(manifest, { compilerVersion: SMPLX_COMPILER_VERSION, contractSources })
			?.reject ?? "read-in-full"
	);
}

describe("the reference examples", () => {
	test("are read in full", () => {
		expect(EXAMPLES.map(outcome)).toEqual(EXAMPLES.map(() => "read-in-full"));
	});
});

describe("what a document is refused for", () => {
	const p2pk = () => example("p2pk");
	const refusal = (raw: Record<string, unknown>, contractSources = p2pk().contractSources) =>
		refuseUnsupported(new Manifest(raw), { contractSources })?.reject;

	test("a format version this wallet does not read", () => {
		expect(refusal({ ...p2pk().raw, manifest_version: "0.2.0" })).toBe("foreign-format");
	});

	test("a capability this wallet does not provide", () => {
		expect(refusal({ ...p2pk().raw, requires: ["custom::feature"] })).toBe(
			"unimplemented-construct",
		);
	});

	test("a key the format does not define", () => {
		expect(refusal({ ...p2pk().raw, attestation_version: "1" })).toBe("document-fault");
	});

	test("a compiler other than the one this wallet ships", () => {
		const { contractSources, manifest } = example("p2pk");

		expect(refuseUnsupported(manifest, { compilerVersion: "0.7.1", contractSources })?.reject).toBe(
			"foreign-compiler",
		);
	});

	test("a contract source other than the one the document pins", () => {
		expect(refusal(p2pk().raw, { "./p2pk.simf": "fn main() {}" })).toBe("source-mismatch");
	});
});

describe("a SimplicityHL version requirement", () => {
	test("reads a bare version as a caret range", () => {
		expect(satisfies("0.7.4", "0.7.1")).toBe(true);
		expect(satisfies("0.8.0", "0.7.1")).toBe(false);
		expect(satisfies("1.4.0", "1.2")).toBe(true);
	});

	test("reads comparators and their conjunction", () => {
		expect(satisfies("0.8.0", ">=0.7")).toBe(true);
		expect(satisfies("0.8.0", ">=0.7, <0.8")).toBe(false);
		expect(satisfies("0.7.9", "~0.7.1")).toBe(true);
	});
});
