import { describe, expect, test } from "bun:test";

import {
	chosenTargetBlocks,
	DEFAULT_FEE_RATE_SATS_PER_KVB,
	quoteTransferSpeeds,
	readSpeedRates,
} from "./feeSpeeds";

const chain = { settings: { backend: { url: "https://esplora.invalid" } } } as never;

describe("the rate each speed is offered at", () => {
	test("is read per block target, slowest first", async () => {
		const rates = await readSpeedRates(chain, async (targetBlocks) => 1000 / targetBlocks);

		expect(rates).toEqual([
			{ feeRateSatsPerKvb: 1000 / 60, targetBlocks: 60 },
			{ feeRateSatsPerKvb: 100, targetBlocks: 10 },
			{ feeRateSatsPerKvb: 1000, targetBlocks: 1 },
		]);
	});

	test("and falls back to the network's floor where the backend gives no estimate", async () => {
		const rates = await readSpeedRates(chain, async () => {
			throw new Error("no estimates here");
		});

		expect(rates.every((rate) => rate.feeRateSatsPerKvb === DEFAULT_FEE_RATE_SATS_PER_KVB)).toBe(
			true,
		);
	});
});

describe("a transfer quoted at every speed", () => {
	test("keeps each quote beside the block target it answers", async () => {
		const backend = {
			quoteTransfer: async (_account: unknown, _params: unknown, _asset: string, rate: number) => ({
				amount: "5000",
				feeRateSatsPerKvb: rate,
				feeSats: String(rate / 10),
			}),
		} as never;

		const quotes = await quoteTransferSpeeds(backend, {} as never, {} as never, "asset", [
			{ feeRateSatsPerKvb: 100, targetBlocks: 60 },
			{ feeRateSatsPerKvb: 300, targetBlocks: 1 },
		]);

		expect(quotes.map(({ feeSats, targetBlocks }) => [targetBlocks, feeSats])).toEqual([
			[60, "10"],
			[1, "30"],
		]);
	});
});

describe("the speed a confirmation came back with", () => {
	test("is the one the person picked", () => {
		expect(chosenTargetBlocks({ targetBlocks: 60 })).toBe(60);
	});

	test("and the fastest one where nothing usable came back", () => {
		expect(chosenTargetBlocks(undefined)).toBe(1);
		expect(chosenTargetBlocks({ targetBlocks: 7 })).toBe(1);
		expect(chosenTargetBlocks({ targetBlocks: "60" })).toBe(1);
	});
});
