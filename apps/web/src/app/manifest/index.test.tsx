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
		expect(html).not.toContain("The contracts this document references");
	});

	test("offers a document to start from, so the empty box is not the only way in", () => {
		expect(renderToStaticMarkup(<ManifestInspector />)).toContain("Load the p2pk example");
	});

	// AC-01's other half. The network is the one thing the page asks for, and it opens without an
	// answer — a default here would be a guess that decides whether two checks refuse.
	test("asks which network, and opens with none chosen", () => {
		const html = renderToStaticMarkup(<ManifestInspector />);

		expect(html).toContain("Network");
		expect(html).toContain("Not chosen");
		expect(html).not.toContain("Liquid Testnet");
	});
});
