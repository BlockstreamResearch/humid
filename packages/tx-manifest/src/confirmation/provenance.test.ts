// oxlint-disable consistent-function-scoping -- each test defines the renderer it is asserting about; hoisting them would make two different subjects one
import { describe, expect, test } from "bun:test";

import { fromDapp, map, type Provenanced } from "./provenance";

describe("deriving from one value", () => {
	test("keeps its origin", () => {
		expect(map(fromDapp("0x01"), (value) => value.toUpperCase()).origin).toBe("dapp");
	});

	test("and cannot raise it, because formatting establishes nothing", () => {
		expect(map(fromDapp(1n), (value) => value + 1n).origin).toBe("dapp");
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
