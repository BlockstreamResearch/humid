import { describe, expect, test } from "bun:test";

import type { ConstructReport, ConstructState } from "@humid/tx-manifest";
import { renderToStaticMarkup } from "react-dom/server";

import { ConstructTable } from "./ConstructTable";

// AC-03 at the surface. The five states and the positions come from the package and are
// tested there; what is checked here is that a reader is shown the state, the field, where it
// sits, and — the part a state name alone does not carry — what that state means for them.

function report(state: ConstructState, key: string = state, at = "manifest"): ConstructReport {
	return { at, key, state };
}

function render(constructs: ConstructReport[]): string {
	return renderToStaticMarkup(<ConstructTable constructs={constructs} />);
}

describe("what a reader is told about each field", () => {
	test("shows the field, where it sits, and its state", () => {
		const html = render([report("unimplemented", "args", "action Pay")]);

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

	test("two fields at different positions are both shown, not collapsed by name", () => {
		const html = render([
			report("acted-on", "description", "action Pay"),
			report("acted-on", "description", "action Receive"),
		]);

		expect(html).toContain("action Pay");
		expect(html).toContain("action Receive");
	});

	test("draws no heading for a state this document does not use", () => {
		expect(render([report("acted-on")])).not.toContain("never-read");
	});
});
