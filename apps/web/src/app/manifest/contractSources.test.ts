import { describe, expect, test } from "bun:test";

import { matchContractSources } from "./contractSources";

// A document references a contract by a path relative to itself and a person hands over a file.
// What must never happen here is a file reaching the reader under a path the document did not
// ask for: the compiler check would then be answered by a source nothing in the document names.

describe("matching supplied files onto the paths a document uses", () => {
	test("puts a file under the path whose last segment is its name", () => {
		const { sources } = matchContractSources(
			["./p2pk.simf"],
			[{ name: "p2pk.simf", text: "fn main() {}" }],
		);

		expect(sources).toEqual({ "./p2pk.simf": "fn main() {}" });
	});

	test("matches a path with no directory in it at all", () => {
		const { sources } = matchContractSources(
			["lending.simf"],
			[{ name: "lending.simf", text: "x" }],
		);

		expect(sources).toEqual({ "lending.simf": "x" });
	});

	test("a file the document does not reference reaches the reader under no path", () => {
		const { sources, unmatched } = matchContractSources(
			["./p2pk.simf"],
			[{ name: "something_else.simf", text: "x" }],
		);

		expect(sources).toEqual({});
		expect(unmatched).toEqual(["something_else.simf"]);
	});

	// A name that merely appears inside another is not the same file, and treating it as one
	// would answer a check with the wrong source.
	test("does not match a name that is only a suffix of the real one", () => {
		const { sources, unmatched } = matchContractSources(
			["./asset_auth_vault.simf"],
			[{ name: "auth_vault.simf", text: "x" }],
		);

		expect(sources).toEqual({});
		expect(unmatched).toEqual(["auth_vault.simf"]);
	});

	test("takes several files at once, and reports both sides", () => {
		const { sources, unmatched } = matchContractSources(
			["./lending.simf", "./script_auth.simf"],
			[
				{ name: "lending.simf", text: "one" },
				{ name: "script_auth.simf", text: "two" },
				{ name: "notes.txt", text: "three" },
			],
		);

		expect(sources).toEqual({ "./lending.simf": "one", "./script_auth.simf": "two" });
		expect(unmatched).toEqual(["notes.txt"]);
	});

	test("nothing supplied is nothing matched, which is not an error", () => {
		expect(matchContractSources(["./p2pk.simf"], [])).toEqual({ sources: {}, unmatched: [] });
	});
});
