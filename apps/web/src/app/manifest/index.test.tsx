import { describe, expect, test } from "bun:test";

import { renderToStaticMarkup } from "react-dom/server";

import ManifestInspector from "./index";

// The claim is that this opens with no wallet installed, no connection and no network, and the
// strongest available check of it is that rendering the whole view touches no wallet context at
// all: every other surface in this app reads one, and reading a missing one here would throw
// rather than degrade.

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

	// The file picker asks for an input, not a result, and until a document says which contracts
	// it references there is nothing to ask for. So it appears with the document rather than
	// beside the answer.
	test("asks for contract sources only once a document has named some", () => {
		expect(renderToStaticMarkup(<ManifestInspector />)).not.toContain("Contract sources");
	});

	test("offers a document to start from, so the empty box is not the only way in", () => {
		expect(renderToStaticMarkup(<ManifestInspector />)).toContain("Load the p2pk example");
	});

	// It no longer asks. The compiler version is one constant this repository ships and the
	// extension reads the same one, so a box here could only disagree with the wallet — and
	// left blank, as it opened, it reported a check as unrun that the wallet could answer.
	test("does not ask which SimplicityHL version, because it reads the shipped one", () => {
		const html = renderToStaticMarkup(<ManifestInspector />);

		expect(html).not.toContain("SimplicityHL version");
	});
});
