// oxlint-disable consistent-function-scoping -- each test defines the renderer it is asserting about; hoisting them would make two different subjects one
import { describe, expect, test } from "bun:test";

import {
	combine,
	computed,
	fromChain,
	fromDapp,
	isEstablished,
	map,
	type Provenanced,
	verified,
	weaker,
} from "./provenance";

describe("origins are ordered by how much the dapp could influence them", () => {
	test("what the wallet checked against the network is the strongest", () => {
		expect(weaker("verified", "chain")).toBe("chain");
	});

	test("what the network says beats what the wallet worked out from dapp inputs", () => {
		expect(weaker("chain", "computed")).toBe("computed");
	});

	test("the dapp's word is the weakest there is", () => {
		expect(weaker("computed", "dapp")).toBe("dapp");
		expect(weaker("verified", "dapp")).toBe("dapp");
	});

	test("an origin combined with itself is itself", () => {
		expect(weaker("chain", "chain")).toBe("chain");
	});
});

describe("combining values", () => {
	test("takes the weaker of the two origins", () => {
		const total = combine(fromChain(2n), fromDapp(3n), (left, right) => left + right);

		expect(total).toEqual({ origin: "dapp", value: 5n } as unknown as Provenanced<bigint>);
	});

	test("so arithmetic cannot launder the dapp's word into the wallet's", () => {
		const laundered = combine(computed(1000n), fromDapp(1n), (left, right) => left * right);

		expect(laundered.origin).toBe("dapp");
	});

	test("two wallet values stay the wallet's", () => {
		expect(combine(verified(1n), computed(2n), (a, b) => a + b).origin).toBe("computed");
	});
});

describe("deriving from one value", () => {
	test("keeps its origin", () => {
		expect(map(fromDapp("0x01"), (value) => value.toUpperCase()).origin).toBe("dapp");
	});

	test("and cannot raise it, because formatting establishes nothing", () => {
		expect(map(fromDapp(1n), (value) => value + 1n).origin).toBe("dapp");
	});
});

describe("what a person is deciding about", () => {
	test("a wallet finding is established", () => {
		expect(isEstablished(verified("tex1p"))).toBe(true);
		expect(isEstablished(fromChain(42n))).toBe(true);
		expect(isEstablished(computed(1n))).toBe(true);
	});

	test("the dapp's word is not", () => {
		expect(isEstablished(fromDapp("a lending protocol"))).toBe(false);
	});
});

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
