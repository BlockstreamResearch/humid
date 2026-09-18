import { describe, expect, test } from "bun:test";

import { renderToStaticMarkup } from "react-dom/server";

import ManifestInspector from "./index";

describe("the inspector with nothing around it", () => {
	test("renders with no wallet context, no provider and no network", () => {
		const html = renderToStaticMarkup(<ManifestInspector />);

		expect(html).toContain("Manifest inspector");
		expect(html).toContain("<textarea");
	});

	test("says what it is and that nothing leaves the page", () => {
		const html = renderToStaticMarkup(<ManifestInspector />);

		expect(html).toContain("Nothing is sent anywhere");
		expect(html).toContain("no wallet is needed");
	});

	test("shows no result panels until something is pasted", () => {
		const html = renderToStaticMarkup(<ManifestInspector />);

		expect(html).not.toContain("What this wallet would do");
		expect(html).not.toContain("What each field is");
	});

	test("asks for contract sources only once a document has named some", () => {
		expect(renderToStaticMarkup(<ManifestInspector />)).not.toContain("Contract sources");
	});

	test("offers a document to start from, so the empty box is not the only way in", () => {
		expect(renderToStaticMarkup(<ManifestInspector />)).toContain("Load the p2pk example");
	});

	test("does not ask which SimplicityHL version, because it reads the shipped one", () => {
		const html = renderToStaticMarkup(<ManifestInspector />);

		expect(html).not.toContain("SimplicityHL version");
	});
});
