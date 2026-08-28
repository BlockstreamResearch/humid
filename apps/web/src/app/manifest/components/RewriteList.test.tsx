import { describe, expect, test } from "bun:test";

import type { NormalisationNote } from "@humid/tx-manifest";
import { renderToStaticMarkup } from "react-dom/server";

import { RewriteList } from "./RewriteList";

// AC-06's second half. Three things per rewrite — where, the name it now carries, the name it
// had — now sitting with the fields rather than in a region of their own. The statement that a
// document needed no rewriting moved to the verdict, so this renders nothing at all for a clean
// document: the page says it once, where the answer is.

function render(rewrites: NormalisationNote[]): string {
	return renderToStaticMarkup(<RewriteList rewrites={rewrites} />);
}

describe("what a reader is told about older spellings", () => {
	test("shows the name found, the name it now carries, and where", () => {
		const html = render([{ at: "action Pay", canonical: "is_constructor", found: "deploy" }]);

		expect(html).toContain("deploy");
		expect(html).toContain("is_constructor");
		expect(html).toContain("action Pay");
	});

	// The verdict carries this now, in one sentence beside the answer it belongs to. A second
	// statement here would be the page saying the same thing twice at different weights.
	test("a clean document draws nothing here at all", () => {
		expect(render([])).toBe("");
	});

	test("says what a rewrite means: the document is from an earlier generation", () => {
		const html = render([{ at: "manifest", canonical: "params", found: "compile_params" }]);

		expect(html).toContain("earlier generation");
	});

	test("shows every rewrite, not only the first", () => {
		const html = render([
			{ at: "manifest", canonical: "manifest_version", found: "compose_version" },
			{ at: "manifest", canonical: "params", found: "compile_params" },
		]);

		expect(html).toContain("compose_version");
		expect(html).toContain("compile_params");
	});
});
