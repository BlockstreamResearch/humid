import { describe, expect, test } from "bun:test";

import { refusalOf } from "../review/reviewForTests";
import { checkRelativeTimelockPlacement, type InputRule, transactionSequence } from "./inputRules";

const programInput = (id: string) => ({ declaredBy: id });

const walletInput = () => ({});

describe("the one sequence this wallet sets for a whole transaction", () => {
	test("is none where no input asks for one", () => {
		expect(transactionSequence([{ id: "a" }, { id: "b" }])).toBeUndefined();
	});

	test("is the value the inputs agree on", () => {
		const rules: InputRule[] = [
			{ id: "a", sequence: 4_294_967_294 },
			{ id: "b" },
			{ id: "c", sequence: 4_294_967_294 },
		];

		expect(transactionSequence(rules)).toBe(4_294_967_294);
	});

	test("refuses where two inputs ask for different ones", () => {
		const rules: InputRule[] = [
			{ id: "a", sequence: 4_294_967_294 },
			{ id: "b", sequence: 4_294_967_293 },
		];
		const refusal = refusalOf(() => transactionSequence(rules));

		expect(refusal.reject).toBe("unimplemented-construct");
		expect(refusal.reason).toContain("cannot give two inputs different ones");
	});

	test("carries a relative timelock rather than refusing it outright", () => {
		expect(transactionSequence([{ id: "a", sequence: 10 }])).toBe(10);
	});
});

describe("whether one sequence can carry a relative timelock faithfully", () => {
	test("it can where the asking input is the only one in the transaction", () => {
		const rules: InputRule[] = [{ id: "will_in", sequence: 25_920 }];

		checkRelativeTimelockPlacement(25_920, rules, [programInput("will_in")]);
	});

	test("it can where every input in the transaction asks for the same wait", () => {
		const rules: InputRule[] = [
			{ id: "one_in", sequence: 144 },
			{ id: "two_in", sequence: 144 },
		];

		checkRelativeTimelockPlacement(144, rules, [programInput("one_in"), programInput("two_in")]);
	});

	test("it cannot where a wallet input would inherit the wait", () => {
		const rules: InputRule[] = [{ id: "will_in", sequence: 25_920 }];
		const placed = [programInput("will_in"), walletInput()];
		const { reason } = refusalOf(() => checkRelativeTimelockPlacement(25_920, rules, placed));

		expect(reason).toContain("will_in");
		expect(reason).toContain("1 other input would inherit that wait");
	});

	test("it counts every input that would inherit the wait", () => {
		const rules: InputRule[] = [{ id: "will_in", sequence: 25_920 }];
		const placed = [programInput("will_in"), walletInput(), walletInput()];

		expect(refusalOf(() => checkRelativeTimelockPlacement(25_920, rules, placed)).reason).toContain(
			"2 other inputs would inherit that wait",
		);
	});

	test("it cannot where a co-spent program input asked for nothing", () => {
		const rules: InputRule[] = [{ id: "locked_in", sequence: 144 }, { id: "open_in" }];
		const placed = [programInput("locked_in"), programInput("open_in")];

		expect(refusalOf(() => checkRelativeTimelockPlacement(144, rules, placed)).reject).toBe(
			"unimplemented-construct",
		);
	});

	test("a sequence with the timelock bit disabled constrains no input, so it carries", () => {
		const rules: InputRule[] = [{ id: "will_in", sequence: 4_294_967_294 }];

		checkRelativeTimelockPlacement(4_294_967_294, rules, [programInput("will_in"), walletInput()]);
	});

	test("an undeclared sequence carries whatever the inputs are", () => {
		checkRelativeTimelockPlacement(undefined, [], [walletInput()]);
	});
});
