// oxlint-disable consistent-function-scoping -- each test defines the renderer it is asserting about; hoisting them would make two different subjects one
import { describe, expect, test } from "bun:test";

import {
	combine,
	computed,
	fromChain,
	fromSite,
	isEstablished,
	map,
	type Provenanced,
	verified,
	weaker,
} from "./provenance";

// AC-07's mechanism. The rules are that site provenance never becomes wallet provenance,
// that combining takes the weakest input, and that an unprovenanced value cannot be
// rendered — the last of which is a type property rather than a test, and is asserted at
// the bottom by code that must not compile.

describe("origins are ordered by how much the site could influence them", () => {
	test("what the wallet checked against the network is the strongest", () => {
		expect(weaker("verified", "chain")).toBe("chain");
	});

	test("what the network says beats what the wallet worked out from site inputs", () => {
		expect(weaker("chain", "computed")).toBe("computed");
	});

	test("the site's word is the weakest there is", () => {
		expect(weaker("computed", "site")).toBe("site");
		expect(weaker("verified", "site")).toBe("site");
	});

	test("an origin combined with itself is itself", () => {
		expect(weaker("chain", "chain")).toBe("chain");
	});
});

describe("combining values", () => {
	test("takes the weaker of the two origins", () => {
		const total = combine(fromChain(2n), fromSite(3n), (left, right) => left + right);

		expect(total).toEqual({ origin: "site", value: 5n } as unknown as Provenanced<bigint>);
	});

	// This is the rule that matters: a number computed from something the site asserted is
	// something the site asserted, however much arithmetic happened in between.
	test("so arithmetic cannot launder the site's word into the wallet's", () => {
		const laundered = combine(computed(1000n), fromSite(1n), (left, right) => left * right);

		expect(laundered.origin).toBe("site");
	});

	test("two wallet values stay the wallet's", () => {
		expect(combine(verified(1n), computed(2n), (a, b) => a + b).origin).toBe("computed");
	});
});

describe("deriving from one value", () => {
	test("keeps its origin", () => {
		expect(map(fromSite("0x01"), (value) => value.toUpperCase()).origin).toBe("site");
	});

	test("and cannot raise it, because formatting establishes nothing", () => {
		expect(map(fromSite(1n), (value) => value + 1n).origin).toBe("site");
	});
});

describe("what a person is deciding about", () => {
	test("a wallet finding is established", () => {
		expect(isEstablished(verified("tex1p"))).toBe(true);
		expect(isEstablished(fromChain(42n))).toBe(true);
		expect(isEstablished(computed(1n))).toBe(true);
	});

	test("the site's word is not", () => {
		expect(isEstablished(fromSite("a lending protocol"))).toBe(false);
	});
});

// The mechanism itself: a plain value is not assignable where a provenanced one is wanted,
// so a surface that renders only provenanced values cannot render an unprovenanced one.
// Asserted as a compile-time fact, because that is the kind of fact it is.
describe("an unprovenanced value cannot reach a surface that wants one", () => {
	test("a plain value is rejected by the type", () => {
		const render = (shown: Provenanced<string>): string => shown.value;

		// @ts-expect-error a plain string carries no origin, so it cannot be rendered
		expect(() => render("a bare string")).toBeDefined();
	});

	test("and an object shaped like one is too, because the brand is not writable", () => {
		const render = (shown: Provenanced<string>): string => shown.value;

		// @ts-expect-error the brand cannot be written by hand
		expect(() => render({ origin: "verified", value: "forged" })).toBeDefined();
	});
});
