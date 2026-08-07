import { describe, expect, test } from "bun:test";

import { renderToStaticMarkup } from "react-dom/server";

import { RefusalPanel } from "./RefusalPanel";

// AC-04 and AC-05, at the only place they can be checked: the text a reader actually meets.
// Rendered to a string rather than to a DOM, because this repository has no DOM in its tests
// and react-dom is already here — the assertions below are about words on a screen, and a
// string carries those.

function render(inspection: Parameters<typeof RefusalPanel>[0]["inspection"]): string {
	return renderToStaticMarkup(<RefusalPanel inspection={inspection} />);
}

const NOTHING_ASKED: Pick<
	Parameters<typeof RefusalPanel>[0]["inspection"],
	"skipped" | "unreachable"
> = {
	skipped: [],
	unreachable: ["covenant-mismatch", "shortfall", "no-fee-rate"],
};

describe("what a reader is told about refusal", () => {
	test("prints the refusal's stable token and its sentence", () => {
		const html = render({
			...NOTHING_ASKED,
			refusal: { reason: 'This protocol is for "bitcoin".', reject: "foreign-chain" },
		});

		expect(html).toContain("foreign-chain");
		expect(html).toContain("bitcoin");
	});

	// The single most misreadable thing on the page. A document can be flawless in every way a
	// document can be judged and still be unbuildable for want of money.
	test("never lets no-refusal read as a promise that the wallet would build", () => {
		const html = render({ ...NOTHING_ASKED, refusal: undefined });

		expect(html).toContain("No refusal that a document alone can decide");
		expect(html).toContain("not a statement that the wallet would build");
	});

	test("names the unreachable checks whether or not a refusal was found", () => {
		for (const refusal of [undefined, { reason: "…", reject: "foreign-chain" as const }]) {
			const html = render({ ...NOTHING_ASKED, refusal });

			expect(html).toContain("covenant-mismatch");
			expect(html).toContain("shortfall");
			expect(html).toContain("no-fee-rate");
			expect(html).toContain("Not checkable from a document at all");
		}
	});

	test("says why the unreachable ones are unreachable, not merely that they are", () => {
		const html = render({ ...NOTHING_ASKED, refusal: undefined });

		expect(html).toContain("money");
		expect(html).toContain("chain read");
	});

	test("separates checks it could have made from checks nothing could", () => {
		const html = render({
			refusal: undefined,
			skipped: ["foreign-compiler"],
			unreachable: ["shortfall"],
		});

		expect(html).toContain("Not checked, because this page was not told what it needs");
		expect(html).toContain("foreign-compiler");
		expect(html).toContain("Not checkable from a document at all");
	});

	test("says nothing about skipped checks when none were skipped", () => {
		const html = render({ ...NOTHING_ASKED, refusal: undefined });

		expect(html).not.toContain("Not checked, because");
	});
});
