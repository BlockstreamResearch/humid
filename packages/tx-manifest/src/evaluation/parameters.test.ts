import { describe, expect, test } from "bun:test";

import dex from "../__fixtures__/current/dex.manifest.json";
import lendingV2 from "../__fixtures__/current/lending_v2.manifest.json";
import lendingV3 from "../__fixtures__/current/lending_v3.manifest.json";
import lending from "../__fixtures__/lending.manifest.json";
import { findAction, normaliseManifest } from "../document/normalise";
import { fillParameters } from "./parameters";

function actionOf(document: unknown, name: string) {
	const action = findAction(normaliseManifest(document as Record<string, unknown>).manifest, name);

	if (!action) {
		throw new Error(`No action named ${name}`);
	}

	return action;
}

/** The action whose parameters carry the corpus's two computed expressions. */
function computingAction() {
	const { manifest } = normaliseManifest(lendingV3 as unknown as Record<string, unknown>);

	for (const action of manifest.actions) {
		const declared = action.node.params as Record<string, Record<string, unknown>> | undefined;

		if (declared && Object.values(declared).some((spec) => typeof spec?.compute === "string")) {
			return action;
		}
	}

	throw new Error("The corpus carries no computed parameter");
}

describe("a parameter the protocol already knows the answer to", () => {
	test("takes the literal the document names, when nothing supplied one", () => {
		const filled = fillParameters(actionOf(dex, "MakeOffer"), {}, { instance: {}, params: {} });

		expect(filled.ok).toBe(true);

		if (filled.ok) {
			expect(filled.params.MAX_FEE).toBe("5000");
		}
	});

	// The order that matters. Both are valid values, so a runtime with the order reversed would
	// pass every test of the filled value and quietly replace what a person chose.
	test("keeps what the request supplied, over the default", () => {
		const filled = fillParameters(
			actionOf(dex, "MakeOffer"),
			{ MAX_FEE: 12 },
			{ instance: {}, params: {} },
		);

		expect(filled.ok && filled.params.MAX_FEE).toBe(12);
	});

	test("is computed from the deployment, where the document computes it", () => {
		const action = computingAction();
		const filled = fillParameters(
			action,
			{},
			{
				instance: {
					CURRENT_DEBT: "11000",
					PRINCIPAL_AMOUNT: "10000",
					PRINCIPAL_INTEREST_RATE: "500",
				},
				params: {},
			},
			[],
		);

		expect(filled.ok).toBe(true);

		if (!filled.ok) {
			return;
		}

		// The protocol's fee is 10000 * 500 / 10000 * 1000 / 10000, which truncates to 50, and
		// the lender's vault takes what is left of the 11000 owed.
		expect(filled.params.TOTAL_PROTOCOL_FEE).toBe("50");
		expect(filled.params.LENDER_VAULT_AMOUNT).toBe("10950");
	});
});

describe("a parameter filled from the wallet itself", () => {
	// Three in the current generation, one in the oldest, and the review opens no signing key —
	// so this refuses by name rather than telling a site it forgot to send something the
	// document never asked it for.
	test("refuses by name under the current generation's spelling", () => {
		const filled = fillParameters(
			actionOf(lendingV2, "IssueUtilityNFTs"),
			{},
			{ instance: {}, params: {} },
		);

		expect(filled.ok).toBe(false);

		if (!filled.ok) {
			expect(filled.reason).toContain("BORROWER_PUB_KEY");
			expect(filled.reject).toBe("unimplemented-construct");
		}
	});

	test("and under the oldest generation's, which spells it differently", () => {
		const filled = fillParameters(
			actionOf(lending, "IssueUtilityNFTs"),
			{},
			{ instance: {}, params: {} },
		);

		expect(filled.ok).toBe(false);

		if (!filled.ok) {
			expect(filled.reason).toContain("BORROWER_PUB_KEY");
		}
	});
});
