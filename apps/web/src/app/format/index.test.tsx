import { describe, expect, test } from "bun:test";

import { describeRegistry } from "@humid/tx-manifest";
import { renderToStaticMarkup } from "react-dom/server";

import FormatSupport from "./index";
import { WHERE_IT_SITS } from "./positions";

function render(): string {
	return renderToStaticMarkup(<FormatSupport />);
}

describe("what this wallet does not read", () => {
	test("leads with it, before anything the wallet does read", () => {
		const html = render();

		expect(html.indexOf("Not implemented")).toBeLessThan(
			html.indexOf("Read, and it changes what gets signed"),
		);
	});

	test("counts what is missing from the table rather than from a sentence", () => {
		const unimplemented = describeRegistry().filter((entry) => entry.state === "unimplemented");

		expect(render()).toContain(`>${unimplemented.length}</span>`);
	});
});

describe("the whole table, not a sample", () => {
	test("renders every construct the runtime registers", () => {
		const html = render();

		for (const entry of describeRegistry()) {
			expect(html).toContain(entry.key);
		}
	});

	test("says how much of the format this is, counted rather than stated", () => {
		expect(render()).toContain(`${describeRegistry().length} fields at`);
	});

	test("says where each one sits in words a reader can use", () => {
		const html = render();

		for (const where of Object.values(WHERE_IT_SITS)) {
			expect(html).toContain(where);
		}
	});
});

describe("the page stands alone", () => {
	test("renders with no wallet, no provider, no network and nothing pasted", () => {
		const html = render();

		expect(html).toContain("What this wallet reads of the format");
		expect(html).not.toContain("<textarea");
	});
});
