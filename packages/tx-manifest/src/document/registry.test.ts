import { describe, expect, test } from "bun:test";

import { normaliseManifest } from "./normalise";
import { inspectConstructs } from "./registry";

const findings = (raw: Record<string, unknown>) => inspectConstructs(normaliseManifest(raw));

describe("the constructs a document declares", () => {
	test("pass where the format defines and this wallet handles them", () => {
		expect(findings({ $comment: "x", chain: "liquid", requires: ["simplicity"] })).toEqual([]);
	});

	test("report what the format defines and this wallet does not implement yet", () => {
		expect(findings({ actions: { Pay: { allow_change: "any" } } })).toEqual([
			{ at: "action Pay", key: "allow_change", state: "unimplemented" },
		]);
	});

	test("report a key the format does not define", () => {
		expect(findings({ classes: {} })).toEqual([
			{ at: "manifest", key: "classes", state: "unrecognised" },
		]);
	});

	test("look inside a covenant reference, where a binding changes the address", () => {
		const declared = findings({
			actions: { Pay: { outputs: [{ destination: { args: {}, utxo_type: "t" }, id: "o" }] } },
		});

		expect(declared.map((finding) => finding.key)).toEqual(["args"]);
	});
});
