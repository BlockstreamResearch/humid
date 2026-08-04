import { describe, expect, test } from "bun:test";

import p2pkManifest from "./__fixtures__/p2pk.manifest.json";
import { parseLiquidProcessCtParams } from "./validation";

// AC-13's other half: a site cannot set the fee. The request contract has no place to put
// one, and a request that invents one is refused rather than quietly stripped — a site that
// believes it set the fee and was ignored is a site that will keep believing it.

const base = {
	action: "Pay",
	contractSources: { "./p2pk.simf": "fn main() { }" },
	manifest: p2pkManifest,
	params: { amount_sat: 1000 },
};

describe("parseLiquidProcessCtParams", () => {
	test("accepts the six-part request", () => {
		const parsed = parseLiquidProcessCtParams(base);

		expect(parsed.ok && parsed.request.action).toBe("Pay");
	});

	test("defaults broadcast to off, so nothing reaches the network unasked", () => {
		const parsed = parseLiquidProcessCtParams(base);

		expect(parsed.ok && parsed.request.broadcast).toBe(false);
	});

	for (const supplied of ["fee", "feeSats", "feeRate", "feeRateSatsPerKvb"]) {
		test(`refuses a request carrying ${supplied}`, () => {
			expect(parseLiquidProcessCtParams({ ...base, [supplied]: 500 }).ok).toBe(false);
		});
	}

	test("refuses a request with no manifest", () => {
		expect(parseLiquidProcessCtParams({ ...base, manifest: undefined }).ok).toBe(false);
	});

	// The caller needs to know which field was wrong, not only that something was. It is a
	// value rather than a thrown transport error because this package has no transport.
	test("and says which field, so the caller can name it", () => {
		const parsed = parseLiquidProcessCtParams({ ...base, manifest: undefined });

		expect(parsed.ok ? [] : Object.keys(parsed.malformed.details.fieldErrors)).toContain(
			"manifest",
		);
	});
});
