import { describe, expect, test } from "bun:test";

import { renderToStaticMarkup } from "react-dom/server";

import { Verdict } from "./Verdict";

// The claims this page makes, at the only place they can be checked: the text a reader actually
// meets. Rendered to a string rather than to a DOM, because this repository has no DOM in its
// tests and react-dom is already here — the assertions below are about words on a screen, and a
// string carries those.

function render(inspection: Parameters<typeof Verdict>[0]["inspection"]): string {
	return renderToStaticMarkup(<Verdict inspection={inspection} />);
}

const NOTHING_ASKED: Pick<
	Parameters<typeof Verdict>[0]["inspection"],
	"constructs" | "partial" | "rewrites" | "skipped" | "unreachable"
> = {
	constructs: [],
	partial: [],
	rewrites: [],
	skipped: [],
	unreachable: ["covenant-mismatch", "shortfall", "no-fee-rate"],
};

describe("the answer this page came to give", () => {
	test("says what the wallet would do before it says anything else", () => {
		const html = render({
			...NOTHING_ASKED,
			refusal: { reason: 'This protocol is for "bitcoin".', reject: "foreign-chain" },
		});

		expect(html.indexOf("would refuse to build an action")).toBeLessThan(
			html.indexOf("Not decidable from a document at all"),
		);
	});

	test("leads with the reader's own sentence, which names where in the document", () => {
		const html = render({
			...NOTHING_ASKED,
			refusal: {
				reason: 'This protocol uses "args" at action Pay, which this wallet does not implement.',
				reject: "unimplemented-construct",
			},
		});

		expect(html).toContain("action Pay");
		expect(html.indexOf("action Pay")).toBeLessThan(html.indexOf("unimplemented-construct"));
	});

	// The single most misreadable thing on the page. A document can be flawless in every way a
	// document can be judged and still be unbuildable for want of money.
	test("never lets no-refusal read as a promise that the wallet would build", () => {
		const html = render({ ...NOTHING_ASKED, refusal: undefined });

		expect(html).toContain("Nothing a document alone can decide refuses this one");
		expect(html).toContain("not a statement that the wallet would build");
	});
});

describe("what was never asked, beside the answer", () => {
	test("names the unreachable checks whether or not a refusal was found", () => {
		for (const refusal of [undefined, { reason: "…", reject: "foreign-chain" as const }]) {
			const html = render({ ...NOTHING_ASKED, refusal });

			expect(html).toContain("covenant-mismatch");
			expect(html).toContain("shortfall");
			expect(html).toContain("no-fee-rate");
			expect(html).toContain("Not decidable from a document at all");
		}
	});

	test("says why the unreachable ones are unreachable, and how many", () => {
		const html = render({ ...NOTHING_ASKED, refusal: undefined });

		expect(html).toContain("3 of this wallet&#x27;s refusals");
		expect(html).toContain("money");
		expect(html).toContain("chain read");
	});

	// Nothing that says a check was not made may hide behind a click: the absence of a
	// refusal is only honest beside the list of what was never asked.
	test("puts nothing unchecked inside a disclosure", () => {
		const html = render({
			constructs: [],
			partial: [{ reject: "foreign-compiler", unread: ["./p2pk.simf"] }],
			refusal: undefined,
			rewrites: [],
			skipped: ["foreign-compiler"],
			unreachable: ["shortfall"],
		});

		expect(html).not.toContain("<details");
		expect(html).not.toContain("hidden");
	});

	test("separates checks it could have made from checks nothing could", () => {
		const html = render({
			constructs: [],
			partial: [],
			refusal: undefined,
			rewrites: [],
			skipped: ["foreign-compiler"],
			unreachable: ["shortfall"],
		});

		expect(html).toContain("Not checked, because this page has not been given what they need");
		expect(html).toContain("foreign-compiler");
		expect(html).toContain("Not decidable from a document at all");
	});

	// Between skipped and done there is a third answer, and the page has to carry it or a check
	// that read one of its two places is read as one that passed.
	test("keeps a half-answered check apart from both a skipped one and a passed one", () => {
		const html = render({
			...NOTHING_ASKED,
			partial: [{ reject: "foreign-compiler", unread: ["./p2pk.simf"] }],
			refusal: undefined,
		});

		expect(html).toContain("Checked in one of the two places that decide it");
		expect(html).toContain("./p2pk.simf");
		expect(html).not.toContain("Not checked, because");
	});

	test("says which sources went unread rather than that some did", () => {
		const html = render({
			...NOTHING_ASKED,
			partial: [{ reject: "foreign-compiler", unread: ["./lending.simf", "./script_auth.simf"] }],
			refusal: undefined,
		});

		expect(html).toContain("./lending.simf");
		expect(html).toContain("./script_auth.simf");
	});

	test("says nothing about a half-answered check when every check was answered in full", () => {
		expect(render({ ...NOTHING_ASKED, refusal: undefined })).not.toContain("Checked in one of");
	});

	test("says nothing about skipped checks when none were skipped", () => {
		expect(render({ ...NOTHING_ASKED, refusal: undefined })).not.toContain("Not checked, because");
	});

	test("tells a reader who can still answer that they can", () => {
		const html = render({ ...NOTHING_ASKED, refusal: undefined, skipped: ["foreign-compiler"] });

		expect(html).toContain("Name it above and the check runs");
	});
});

describe("the runtime's own names for its refusals", () => {
	// A person cannot act on a reject token; they can act on the sentence beside it. The
	// token stays for whoever is chasing one into the code, and stops being what they meet first.
	test("never puts a token where the heading goes", () => {
		const html = render({
			...NOTHING_ASKED,
			refusal: { reason: "This protocol is for bitcoin.", reject: "foreign-chain" },
		});

		const headings = [...html.matchAll(/<h3[^>]*>([^<]*)<\/h3>/g)].map((match) => match[1]);

		expect(headings.length).toBeGreaterThan(0);

		for (const heading of headings) {
			for (const token of ["foreign-chain", ...NOTHING_ASKED.unreachable]) {
				expect(heading).not.toContain(token);
			}
		}

		expect(html.indexOf("This protocol is for bitcoin.")).toBeLessThan(
			html.indexOf("foreign-chain"),
		);
	});
});

describe("older spellings, said once", () => {
	// A renaming that succeeded changed nothing about the answer, so what is
	// worth saying is that the document belongs to an earlier generation — one sentence, here.
	test("counts them and says they changed nothing about the answer", () => {
		const html = render({
			...NOTHING_ASKED,
			refusal: undefined,
			rewrites: [
				{ at: "manifest", canonical: "manifest_version", found: "compose_version" },
				{ at: "manifest", canonical: "params", found: "compile_params" },
			],
		});

		expect(html).toContain("2 older spellings");
		expect(html).toContain("changed nothing about the answer");
	});

	test("says so when a document needed none, rather than leaving it unsaid", () => {
		const html = render({ ...NOTHING_ASKED, refusal: undefined });

		expect(html).toContain("current spelling");
	});
});

describe("more than one field would refuse", () => {
	// A protocol refusing on one decorative field reads as hopeless when the field table below
	// says a few fixable gaps, and the runtime names only the first by design.
	test("says how many fields would refuse, not only which one the wallet names", () => {
		const html = render({
			...NOTHING_ASKED,
			constructs: [
				{ at: "manifest", key: "$schema", site: "manifest", state: "unrecognised" },
				{ at: "manifest", key: "contract_templates", site: "manifest", state: "unrecognised" },
				{ at: "manifest", key: "simplicity_hl", site: "manifest", state: "unrecognised" },
				{ at: "manifest", key: "description", site: "manifest", state: "shown" },
			],
			refusal: { reason: "…", reject: "unrecognised-construct" },
		});

		expect(html).toContain("3 fields in this document would refuse");
		expect(html).toContain("The other 2");
	});

	test("does not count when the wallet's one refusal is the whole of it", () => {
		const html = render({
			...NOTHING_ASKED,
			constructs: [{ at: "manifest", key: "$schema", site: "manifest", state: "unrecognised" }],
			refusal: { reason: "…", reject: "unrecognised-construct" },
		});

		expect(html).not.toContain("would refuse, and the wallet names");
	});
});
