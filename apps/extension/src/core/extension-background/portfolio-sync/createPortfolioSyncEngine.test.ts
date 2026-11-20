import { afterEach, describe, expect, setSystemTime, test } from "bun:test";

import { createPortfolioSyncEngine } from "./createPortfolioSyncEngine";

const DATA = { assets: [] } as never;
const START = 1_700_000_000_000;

function engineScanning(outcomes: ("fail" | "ok")[]) {
	let scans = 0;
	const engine = createPortfolioSyncEngine(async () => ({
		key: "account",
		scan: async () => {
			const outcome = outcomes[scans] ?? "ok";

			scans += 1;

			if (outcome === "fail") throw new Error("not listening yet");

			return DATA;
		},
	}));

	return { engine, scans: () => scans };
}

afterEach(() => setSystemTime());

describe("a portfolio sync", () => {
	test("that failed is tried again a few seconds later, not a minute later", async () => {
		const { engine, scans } = engineScanning(["fail", "ok"]);

		setSystemTime(new Date(START));
		await engine.refresh();
		expect((await engine.getSnapshot()).error).toBe("not listening yet");

		setSystemTime(new Date(START + 6_000));
		await engine.getSnapshot();
		await engine.getSnapshot();

		expect(scans()).toBe(2);
		expect((await engine.getSnapshot()).error).toBeNull();
	});

	test("that succeeded waits a minute before the next", async () => {
		const { engine, scans } = engineScanning(["ok"]);

		setSystemTime(new Date(START));
		await engine.refresh();
		setSystemTime(new Date(START + 30_000));
		await engine.getSnapshot();

		expect(scans()).toBe(1);
	});
});
