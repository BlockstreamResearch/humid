import { describe, expect, test } from "bun:test";

import { normaliseManifest } from "./normalise";
import { describeConstructs, describeRegistry, inspectConstructs } from "./registry";

const normalise = (raw: Record<string, unknown>) => normaliseManifest(raw).manifest;

describe("what the runtime registers, with no document in hand", () => {
	test("every construct it does not act on says why, and every one it does says nothing", () => {
		for (const entry of describeRegistry()) {
			if (entry.state === "acted-on" || entry.state === "shown") {
				expect(entry.reason).toBeUndefined();
				continue;
			}

			expect(entry.reason?.length).toBeGreaterThan(0);
		}
	});

	test("no construct is registered as unrecognised, which is a state only a document reaches", () => {
		expect(describeRegistry().some((entry) => entry.state === "unrecognised")).toBe(false);
	});

	test("carries the keys answered at every position with no position", () => {
		const everywhere = describeRegistry().filter((entry) => entry.site === undefined);

		expect(everywhere.map((entry) => entry.key).toSorted()).toEqual([
			"$comment",
			"$comment_schema",
			"$schema",
		]);
	});

	test("registers each key against the kind of position it sits at", () => {
		const entries = describeRegistry().filter((entry) => entry.key === "description");

		expect(entries.length).toBeGreaterThan(1);
		expect(new Set(entries.map((entry) => entry.site)).size).toBe(entries.length);
	});
});

describe("what one document declares, read from the same table", () => {
	test("reports the handled constructs the refusal reader drops", () => {
		const manifest = normalise({ chain: "liquid" });

		expect(inspectConstructs(manifest)).toEqual([]);
		expect(describeConstructs(manifest)).toEqual([
			{ at: "manifest", key: "chain", site: "manifest", state: "acted-on" },
		]);
	});

	test("agrees with the refusal reader about what is unhandled", () => {
		const manifest = normalise({ actions: { Pay: { args: {} } }, nobody_lists_this: 1 });
		const unhandled = describeConstructs(manifest).filter(
			(report) => report.state === "unimplemented" || report.state === "unrecognised",
		);

		expect(unhandled.map((report) => report.key).toSorted()).toEqual(
			inspectConstructs(manifest)
				.map((finding) => finding.key)
				.toSorted(),
		);
	});

	test("reports the same key at two kinds of position as two constructs", () => {
		const reports = describeConstructs(
			normalise({
				actions: { Pay: { description: "d", outputs: [{ description: "d", id: "o" }] } },
			}),
		).filter((report) => report.key === "description");

		expect(reports.map((report) => report.site).toSorted()).toEqual(["action", "output"]);
	});
});
