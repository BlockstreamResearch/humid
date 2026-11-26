import { describe, expect, test } from "bun:test";

import { inspectConstructs } from "./registry";

const findings = (raw: Record<string, unknown>) => inspectConstructs(raw);

describe("the constructs a document declares", () => {
	test("pass where the format defines and this wallet handles them", () => {
		expect(findings({ $comment: "x", chain: "liquid", requires: ["simplicity"] })).toEqual([]);
	});

	test("report what the format defines and this wallet does not implement yet", () => {
		expect(findings({ actions: { Pay: { on_post_broadcast: { set: {} } } } })).toEqual([
			{ at: "action Pay", key: "on_post_broadcast", state: "unimplemented" },
		]);
	});

	test("report a key the format does not define", () => {
		expect(findings({ classes: {} })).toEqual([
			{ at: "manifest", key: "classes", state: "unrecognised" },
		]);
	});

	test("look inside a computed value, which a wallet must not half-read", () => {
		const computed = (compute: Record<string, unknown>) =>
			findings({ actions: { Open: { create_instance: { fields: { HASH: compute } } } } });

		expect(computed({ simf: "./a.simf", simf_hash: "sha256:00", type: "tapleaf" })).toEqual([]);
		expect(computed({ lang: "tapleaf", simf: "./a.simf" })).toEqual([
			{ at: "action Open / create_instance / HASH", key: "lang", state: "unrecognised" },
		]);
		expect(
			findings({
				actions: { Open: { params: { K: { compute: { depends_on: [], type: "tapleaf" } } } } },
			}),
		).toEqual([
			{ at: "action Open / param K / compute", key: "depends_on", state: "unimplemented" },
		]);
	});

	test("take $schema at the root only, as an editor hint, and $comment anywhere", () => {
		expect(
			findings({ $schema: "./s.json", actions: { Pay: { $comment: "x", $schema: "./s.json" } } }),
		).toEqual([{ at: "action Pay", key: "$schema", state: "unrecognised" }]);
	});

	test("look inside a program reference, where a binding changes the address", () => {
		const declared = findings({
			actions: { Pay: { outputs: [{ destination: { if: "x", utxo_type: "t" }, id: "o" }] } },
		});

		expect(declared.map((finding) => finding.key)).toEqual(["if"]);
	});
});
