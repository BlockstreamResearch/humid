import { describe, expect, test } from "bun:test";

import { placeInputs } from "./inputOrder";

/**
 * The layout on its own, with the pieces written as their own names.
 *
 * A slot here is a string because what a slot is belongs to the caller: the review hands this
 * covenant records and chosen outputs, and nothing about placing them depends on which. The
 * order that comes back is the order the wallet adds its inputs in.
 */
function order(declared: { id?: string; slots: string[]; stated?: number }[]): string[] {
	return placeInputs(declared).order;
}

describe("laying out the inputs a document states positions for", () => {
	// The wallet's own habit is covenants first, so an input it supplies could only ever land
	// after them. Every published contract that fixes an input at zero fixes one the wallet
	// supplies, which is the whole reason this exists.
	test("puts a wallet's own input ahead of a covenant when the document says zero", () => {
		expect(
			order([
				{ id: "borrower_nft_in", slots: ["nft"], stated: 0 },
				{ id: "active_offer_in", slots: ["covenant"], stated: 1 },
				{ id: "fee_input", slots: ["fee"] },
			]),
		).toEqual(["nft", "covenant", "fee"]);
	});

	test("leaves the order alone when the document asks for the one it would have used", () => {
		expect(
			order([
				{ id: "offer_in", slots: ["covenant"], stated: 0 },
				{ id: "nft_in", slots: ["nft"], stated: 1 },
				{ id: "fee_input", slots: ["fee"] },
			]),
		).toEqual(["covenant", "nft", "fee"]);
	});

	// A negative position cannot be read without knowing how many inputs there are, which is
	// exactly why the total is counted before anything is placed rather than while it is.
	test("counts a negative position from the end", () => {
		expect(
			order([
				{ id: "covenant_in", slots: ["covenant"] },
				{ id: "last_in", slots: ["last"], stated: -1 },
				{ id: "fee_input", slots: ["fee"] },
			]),
		).toEqual(["covenant", "fee", "last"]);
	});

	// The wallet needed two of its own outputs to cover one declared amount. They stay together
	// from the stated position, because a declared input whose pieces are scattered through the
	// transaction has no one position for a contract to read.
	test("keeps the outputs funding one declared input together, starting where it was asked", () => {
		expect(
			order([
				{ id: "covenant_in", slots: ["covenant"] },
				{ id: "collateral_in", slots: ["one", "two"], stated: 0 },
				{ id: "fee_input", slots: ["fee"] },
			]),
		).toEqual(["one", "two", "covenant", "fee"]);
	});

	test("fills what is left in declaration order, so nothing states a place it does not need", () => {
		expect(
			order([
				{ id: "first", slots: ["first"] },
				{ id: "second", slots: ["second"] },
				{ id: "placed", slots: ["placed"], stated: 1 },
			]),
		).toEqual(["first", "placed", "second"]);
	});

	test("reports where each declared input landed, by the name the document gives it", () => {
		const placement = placeInputs([
			{ id: "nft_in", slots: ["nft"], stated: 2 },
			{ id: "covenant_in", slots: ["covenant"] },
			{ id: "fee_input", slots: ["fee_one", "fee_two"] },
		]);

		expect([...placement.at]).toEqual([
			["nft_in", 2],
			["covenant_in", 0],
			["fee_input", 1],
		]);
	});
});

/**
 * What placement must not do, which is turn an impossible document into a built transaction.
 *
 * Being able to honour a position is not a licence to honour every one of them. A piece that
 * cannot go where it was asked keeps whatever place is left, and the caller's own check reads
 * that place and refuses by name — so the layout is where the refusal gets its evidence, not
 * where it gets suppressed.
 */
describe("a position that cannot be honoured", () => {
	test("leaves the second of two inputs claiming one index somewhere it did not ask for", () => {
		const placement = placeInputs([
			{ id: "first_in", slots: ["first"], stated: 0 },
			{ id: "second_in", slots: ["second"], stated: 0 },
		]);

		expect(placement.order).toEqual(["first", "second"]);
		expect(placement.at.get("second_in")).toBe(1);
	});

	test("leaves an input asking for a place past the end of the transaction elsewhere", () => {
		const placement = placeInputs([
			{ id: "covenant_in", slots: ["covenant"] },
			{ id: "far_in", slots: ["far"], stated: 9 },
		]);

		expect(placement.order).toEqual(["covenant", "far"]);
		expect(placement.at.get("far_in")).toBe(1);
	});

	// The hazard a two-output selection creates: the run takes the covenant's place, so the
	// covenant cannot have it. Neither is silently moved — both land, and the check that reads
	// where they landed is what stops the transaction.
	test("leaves a covenant displaced by a run that reached its index", () => {
		const placement = placeInputs([
			{ id: "nft_in", slots: ["one", "two"], stated: 0 },
			{ id: "covenant_in", slots: ["covenant"], stated: 1 },
		]);

		expect(placement.order).toEqual(["one", "two", "covenant"]);
		expect(placement.at.get("covenant_in")).toBe(2);
	});

	test("gives no place at all to a declared input the wallet builds nothing for", () => {
		const placement = placeInputs([
			{ id: "covenant_in", slots: ["covenant"] },
			{ id: "unfunded_in", slots: [], stated: 1 },
		]);

		expect(placement.order).toEqual(["covenant"]);
		expect(placement.at.has("unfunded_in")).toBe(false);
	});
});
