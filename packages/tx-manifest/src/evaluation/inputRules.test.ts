import { describe, expect, test } from "bun:test";

import { type InputRule, relativeTimelockPlacement, transactionSequence } from "./inputRules";

const covenantInput = (id: string) => ({ declaredBy: id });

const walletInput = () => ({});

describe("the one sequence this wallet sets for a whole transaction", () => {
	test("is none where no input asks for one", () => {
		expect(transactionSequence([{ id: "a" }, { id: "b" }])).toEqual({ ok: true, value: undefined });
	});

	test("is the value the inputs agree on", () => {
		const rules: InputRule[] = [
			{ id: "a", sequence: 4_294_967_294 },
			{ id: "b" },
			{ id: "c", sequence: 4_294_967_294 },
		];

		expect(transactionSequence(rules)).toEqual({ ok: true, value: 4_294_967_294 });
	});

	test("refuses where two inputs ask for different ones", () => {
		const rules: InputRule[] = [
			{ id: "a", sequence: 4_294_967_294 },
			{ id: "b", sequence: 4_294_967_293 },
		];
		const result = transactionSequence(rules);

		expect(result.ok).toBe(false);

		if (!result.ok) {
			expect(result.reason).toContain("cannot give two inputs different ones");
		}
	});

	test("carries a relative timelock rather than refusing it outright", () => {
		expect(transactionSequence([{ id: "a", sequence: 10 }])).toEqual({ ok: true, value: 10 });
	});
});

describe("whether one sequence can carry a relative timelock faithfully", () => {
	test("it can where the asking input is the only one in the transaction", () => {
		const rules: InputRule[] = [{ id: "will_in", sequence: 25_920 }];

		expect(relativeTimelockPlacement(25_920, rules, [covenantInput("will_in")])).toEqual({
			ok: true,
		});
	});

	test("it can where every input in the transaction asks for the same wait", () => {
		const rules: InputRule[] = [
			{ id: "one_in", sequence: 144 },
			{ id: "two_in", sequence: 144 },
		];
		const placed = [covenantInput("one_in"), covenantInput("two_in")];

		expect(relativeTimelockPlacement(144, rules, placed)).toEqual({ ok: true });
	});

	test("it cannot where a wallet input would inherit the wait", () => {
		const rules: InputRule[] = [{ id: "will_in", sequence: 25_920 }];
		const placed = [covenantInput("will_in"), walletInput()];
		const result = relativeTimelockPlacement(25_920, rules, placed);

		expect(result.ok).toBe(false);

		if (!result.ok) {
			expect(result.reason).toContain("will_in");
			expect(result.reason).toContain("1 other input would inherit that wait");
		}
	});

	test("it counts every input that would inherit the wait", () => {
		const rules: InputRule[] = [{ id: "will_in", sequence: 25_920 }];
		const placed = [covenantInput("will_in"), walletInput(), walletInput()];
		const result = relativeTimelockPlacement(25_920, rules, placed);

		expect(result.ok).toBe(false);

		if (!result.ok) {
			expect(result.reason).toContain("2 other inputs would inherit that wait");
		}
	});

	test("it cannot where a co-spent covenant input asked for nothing", () => {
		const rules: InputRule[] = [{ id: "locked_in", sequence: 144 }, { id: "open_in" }];
		const placed = [covenantInput("locked_in"), covenantInput("open_in")];

		expect(relativeTimelockPlacement(144, rules, placed).ok).toBe(false);
	});

	test("a sequence with the timelock bit disabled constrains no input, so it carries", () => {
		const rules: InputRule[] = [{ id: "will_in", sequence: 4_294_967_294 }];
		const placed = [covenantInput("will_in"), walletInput()];

		expect(relativeTimelockPlacement(4_294_967_294, rules, placed)).toEqual({ ok: true });
	});

	test("an undeclared sequence carries whatever the inputs are", () => {
		expect(relativeTimelockPlacement(undefined, [], [walletInput()])).toEqual({ ok: true });
	});
});
