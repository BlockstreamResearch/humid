import { describe, expect, test } from "bun:test";

import type { NormalisationNote } from "@humid/tx-manifest";
import { renderToStaticMarkup } from "react-dom/server";

import { RewriteList } from "./RewriteList";

// AC-02 at the surface. The criterion asks for three things per rewrite — where, the name it
// now carries, the name it had — and for a clean document to say so rather than show nothing,
// because an empty region and "nothing needed rewriting" look identical and mean different
// things.

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

	test("a clean document says nothing was rewritten rather than showing an empty region", () => {
		const html = render([]);

		expect(html).toContain("Nothing was rewritten");
		expect(html).toContain("current spelling");
		expect(html).not.toContain("<table");
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
