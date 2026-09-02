import { describe, expect, test } from "bun:test";

import type { ConstructReport, ConstructSiteKind, ConstructState } from "@humid/tx-manifest";
import { renderToStaticMarkup } from "react-dom/server";

import { ConstructTable } from "./ConstructTable";

// The five states and the positions come from the package and are tested there; what is checked
// here is that a reader is shown the state, the field, where it sits, how many places that is,
// and — the part a state name alone does not carry — what that state means for them.

function report(
	state: ConstructState,
	key: string = state,
	at = "manifest",
	site: ConstructSiteKind = "manifest",
): ConstructReport {
	return { at, key, site, state };
}

function render(constructs: ConstructReport[]): string {
	return renderToStaticMarkup(<ConstructTable constructs={constructs} />);
}

describe("what a reader is told about each field", () => {
	test("shows the field, where it sits, and its state", () => {
		const html = render([report("unimplemented", "args", "action Pay", "action")]);

		expect(html).toContain("args");
		expect(html).toContain("action Pay");
		expect(html).toContain("unimplemented");
	});

	test("explains what each state means rather than only naming it", () => {
		expect(render([report("acted-on")])).toContain("changes what gets signed");
		expect(render([report("shown")])).toContain("It decides nothing");
		expect(render([report("unimplemented")])).toContain("does not implement it");
		expect(render([report("unrecognised")])).toContain("No specification this wallet knows");
		expect(render([report("never-read")])).toContain("read by nothing");
	});

	test("a document declaring nothing says so rather than drawing an empty table", () => {
		const html = render([]);

		expect(html).toContain("declares no fields");
		expect(html).not.toContain("<table");
	});

	test("draws no heading for a state this document does not use", () => {
		expect(render([report("acted-on")])).not.toContain("never-read");
	});
});

describe("a key that recurs draws one row", () => {
	test("counts the positions instead of repeating the field", () => {
		const html = render([
			report("unimplemented", "args", "action Pay", "action"),
			report("unimplemented", "args", "action Refund", "action"),
			report("unimplemented", "args", "action Close", "action"),
		]);

		expect(html.match(/args/g)).toHaveLength(1);
		expect(html).toContain("3 positions");
	});

	test("still names every position, so nothing is only counted", () => {
		const html = render([
			report("unimplemented", "args", "action Pay", "action"),
			report("unimplemented", "args", "action Refund", "action"),
		]);

		expect(html).toContain("action Pay");
		expect(html).toContain("action Refund");
	});

	test("names the one position outright when a field sits at exactly one", () => {
		const html = render([report("unimplemented", "args", "action Pay", "action")]);

		expect(html).toContain("action Pay");
		expect(html).not.toContain("1 positions");
	});
});

describe("what is working opens closed", () => {
	// Not hidden and not dropped: the count is visible without clicking and the rows are one
	// click away. What is removed is meeting hundreds of rows that say a field works before
	// reaching the few that say anything else.
	test("puts the states that mean nothing is wrong behind a disclosure", () => {
		const html = render([report("acted-on", "chain"), report("shown", "description")]);

		expect(html.match(/<details/g)).toHaveLength(2);
	});

	test("leaves anything unrecognised or unimplemented open", () => {
		const html = render([
			report("unrecognised", "wat"),
			report("unimplemented", "args", "action Pay", "action"),
			report("never-read", "source"),
		]);

		expect(html).not.toContain("<details");
	});

	test("says how much a closed group holds before it is opened", () => {
		const html = render([
			report("acted-on", "chain"),
			report("acted-on", "amount_sat", "action Pay / output a", "output"),
			report("acted-on", "amount_sat", "action Pay / output b", "output"),
		]);

		expect(html).toContain("2 fields, at 3 positions");
	});
});
