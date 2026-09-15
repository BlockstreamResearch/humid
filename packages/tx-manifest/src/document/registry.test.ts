import { describe, expect, test } from "bun:test";

import { normaliseManifest } from "./normalise";
import { describeConstructs, describeRegistry, inspectConstructs } from "./registry";

// The table is what every refusal about a construct is decided by, and it is now also what two
// pages are drawn from. What has to hold is that the two readings are the same reading: a
// construct that refuses and a construct that is reported cannot disagree, because a table that
// says one thing to a wallet and another to a developer is worse than no table.

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

	// The two keys any JSON document may carry at any depth are answered once rather than listed
	// at every position, so they are the entries with no position of their own.
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

	// The same finding, twice, from the two readers. A construct that refuses and is not
	// reported — or is reported as working — is the drift this shares a traversal to prevent.
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
