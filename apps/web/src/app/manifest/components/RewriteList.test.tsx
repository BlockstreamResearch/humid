import { describe, expect, test } from "bun:test";

import type { NormalisationNote } from "@humid/tx-manifest";
import { renderToStaticMarkup } from "react-dom/server";

import { RewriteList } from "./RewriteList";

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

	test("a clean document draws nothing here at all", () => {
		expect(render([])).toBe("");
	});

	test("says what a rewrite means: the document is from an earlier generation", () => {
		const html = render([{ at: "manifest", canonical: "params", found: "compile_params" }]);

		expect(html).toContain("earlier generation");
	});

	test("shows every rewrite, not only the first", () => {
		const html = render([
			{ at: "action Pay", canonical: "is_constructor", found: "deploy" },
			{ at: "instance", canonical: "instance.fields", found: "instance_params" },
		]);

		expect(html).toContain("deploy");
		expect(html).toContain("instance_params");
	});
});
