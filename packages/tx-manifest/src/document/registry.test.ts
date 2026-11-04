import { describe, expect, test } from "bun:test";

import { normaliseManifest } from "./normalise";
import { describeRegistry, inspectConstructs } from "./registry";

const findings = (raw: Record<string, unknown>) => inspectConstructs(normaliseManifest(raw));

describe("the constructs a document declares", () => {
	test("pass where the format defines and this wallet handles them", () => {
		expect(findings({ $comment: "x", chain: "liquid", requires: ["simplicity"] })).toEqual([]);
	});

	test("name a removed key and what replaced it", () => {
		expect(findings({ classes: {} })).toEqual([
			{ at: "manifest", key: "classes", replacement: "contract_templates", state: "removed" },
		]);
	});

	test("tell a removed key apart by where it sits", () => {
		const params = findings({ actions: { Pay: { params: {} } }, params: {} });

		expect(params).toEqual([
			{ at: "manifest", key: "params", replacement: "params on the action", state: "removed" },
		]);
	});

	test("report what the format defines and this wallet does not implement yet", () => {
		expect(findings({ actions: { Pay: { allow_change: "any" } } })).toEqual([
			{ at: "action Pay", key: "allow_change", state: "unimplemented" },
		]);
	});

	test("report a key the format does not define", () => {
		expect(findings({ nobody_lists_this: 1 })).toEqual([
			{ at: "manifest", key: "nobody_lists_this", state: "unrecognised" },
		]);
	});

	test("look inside a covenant reference, where a binding changes the address", () => {
		const declared = findings({
			actions: { Pay: { outputs: [{ destination: { args: {}, utxo_type: "t" }, id: "o" }] } },
		});

		expect(declared.map((finding) => finding.key)).toEqual(["args"]);
	});
});

test("the registry names a replacement only for removed keys", () => {
	for (const entry of describeRegistry()) {
		if (entry.replacement !== undefined) {
			expect(entry.state).toBe("removed");
		}
	}
});
