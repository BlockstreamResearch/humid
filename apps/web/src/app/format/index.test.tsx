import { describe, expect, test } from "bun:test";

import { describeRegistry } from "@humid/tx-manifest";
import { renderToStaticMarkup } from "react-dom/server";

import FormatSupport from "./index";
import { WHERE_IT_SITS } from "./positions";

// The page's whole content is the runtime's own construct table, so what is checked here is
// that all of it arrives, that what the wallet cannot do leads, and that every gap carries its
// reason — the part no document can ever show, because no published protocol uses any of them.

function render(): string {
	return renderToStaticMarkup(<FormatSupport />);
}

describe("what this wallet does not implement", () => {
	test("leads with it, before anything the wallet does read", () => {
		const html = render();

		expect(html.indexOf("Not implemented")).toBeLessThan(
			html.indexOf("Read, and it changes what gets signed"),
		);
	});

	test("names every construct the runtime does not act on, with its reason", () => {
		const html = render();

		for (const entry of describeRegistry().filter((candidate) => candidate.reason !== undefined)) {
			expect(html).toContain(entry.key);
			expect(html).toContain(escaped(entry.reason ?? ""));
		}
	});

	// The count is what an engineer came for and the one thing that must not be written down by
	// hand: a sentence saying "eight" survives a ninth being added.
	test("counts what is missing from the table rather than from a sentence", () => {
		const unimplemented = describeRegistry().filter((entry) => entry.state === "unimplemented");

		expect(render()).toContain(`>${unimplemented.length}</span>`);
	});
});

describe("the whole table, not a sample of it", () => {
	test("renders every construct the runtime registers", () => {
		const html = render();

		for (const entry of describeRegistry()) {
			expect(html).toContain(entry.key);
		}
	});

	test("says how much of the format this is, counted rather than stated", () => {
		const entries = describeRegistry();
		const positioned = entries.filter((entry) => entry.site !== undefined);

		expect(render()).toContain(`${positioned.length} fields at`);
	});

	test("says where each one sits in words a reader can use", () => {
		const html = render();

		for (const where of Object.values(WHERE_IT_SITS)) {
			expect(html).toContain(where);
		}
	});
});

describe("the page stands alone", () => {
	// It holds no wallet context and reads no document: every other surface in this app reads a
	// wallet context, and reading a missing one would throw.
	test("renders with no wallet, no provider, no network and nothing pasted", () => {
		const html = render();

		expect(html).toContain("What this wallet reads of the format");
		expect(html).not.toContain("<textarea");
	});
});

function escaped(text: string): string {
	return text
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#x27;");
}
