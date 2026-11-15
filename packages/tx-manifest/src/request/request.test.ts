import { describe, expect, test } from "bun:test";

import p2pkManifest from "../__fixtures__/p2pk/txmanifest.json";
import { parseActionRequest } from "./request";

const base = {
	action: "Pay",
	contractSources: { "./p2pk.simf": "fn main() { }" },
	manifest: p2pkManifest,
	params: { amount_sat: 1000 },
};

describe("parseActionRequest", () => {
	test("accepts the six-part request", () => {
		const parsed = parseActionRequest(base);

		expect(parsed.ok && parsed.request.action).toBe("Pay");
	});

	test("defaults broadcast to off, so nothing reaches the network unasked", () => {
		const parsed = parseActionRequest(base);

		expect(parsed.ok && parsed.request.broadcast).toBe(false);
	});

	for (const supplied of ["fee", "feeSats", "feeRate", "feeRateSatsPerKvb"]) {
		test(`refuses a request carrying ${supplied}`, () => {
			expect(parseActionRequest({ ...base, [supplied]: 500 }).ok).toBe(false);
		});
	}

	test("refuses a request with no manifest", () => {
		expect(parseActionRequest({ ...base, manifest: undefined }).ok).toBe(false);
	});

	test("and says which field, for the caller to report", () => {
		const parsed = parseActionRequest({ ...base, manifest: undefined });

		expect(parsed.ok ? [] : Object.keys(parsed.malformed.details.fieldErrors)).toContain(
			"manifest",
		);
	});
});
