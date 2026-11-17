import { describe, expect, test } from "bun:test";

import { parseActionRequest } from "@humid/tx-manifest";

import { Preset, type PresetStep } from "./Preset";

const KEY = "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
const WILL = { after: ["Fund", "Refresh"], utxoType: "last_will", vout: 0 };
const [fund, refresh, coldBreak]: PresetStep[] = [
	{ action: "Fund", params: (key) => ({ COLD_PUB_KEY: key }) },
	{ action: "Refresh", spends: WILL },
	{ action: "ColdBreak", spends: WILL },
];
const will = new Preset(
	"last_will",
	"",
	[fund!, refresh!, coldBreak!],
	{ contractSources: { "./will.simf": "fn main() {}" }, manifest: {} },
	"last_will_contract",
);
const funded = { action: "Fund", deployment: { COLD_PUB_KEY: KEY }, txid: "aa".repeat(32) };
const refreshed = { action: "Refresh", spent: funded.txid, txid: "bb".repeat(32) };

describe("a preset step's request", () => {
	test("sends the first step at once, with the wallet's key in its params", () => {
		const request = will.request(fund!, KEY, []);

		expect(request).toMatchObject({
			action: "Fund",
			broadcast: true,
			params: { COLD_PUB_KEY: KEY },
		});
		expect(parseActionRequest(request).ok).toBe(true);
	});

	test("waits for the step whose output it spends", () => {
		expect(will.request(refresh!, KEY, [])).toBeUndefined();
	});

	test("spends the latest such output, under the contract the first step deployed", () => {
		expect(will.request(coldBreak!, KEY, [funded, refreshed])).toMatchObject({
			instance: { instance: { fields: funded.deployment, template: "last_will_contract" } },
			state: { utxos: [{ txid: refreshed.txid, utxo_type: "last_will", vout: 0 }] },
		});
	});

	test("is closed once a later step spent that output", () => {
		const broken = { action: "ColdBreak", spent: refreshed.txid, txid: "cc".repeat(32) };

		expect(will.request(refresh!, KEY, [funded, refreshed, broken])).toBeUndefined();
	});
});
