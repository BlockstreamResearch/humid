import { describe, expect, test } from "bun:test";

import { renderToStaticMarkup } from "react-dom/server";

import ManifestInspector from "./index";

// AC-06. The claim is that this opens with no wallet installed, no connection and no network,
// and the strongest available check of it is that rendering the whole view touches no wallet
// context at all: every other surface in this app reads one, and reading a missing one here
// would throw rather than degrade.

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

		expect(html).not.toContain("What the wallet would refuse");
		expect(html).not.toContain("What each field is");
		expect(html).not.toContain("What was rewritten");
	});

	test("offers a document to start from, so the empty box is not the only way in", () => {
		expect(renderToStaticMarkup(<ManifestInspector />)).toContain("Load the p2pk example");
	});
});
