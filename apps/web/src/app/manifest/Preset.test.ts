import { describe, expect, test } from "bun:test";

import { parseActionRequest } from "@humid/tx-manifest";

import { Preset, type PresetStep } from "./Preset";

const KEY = "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
const ACCOUNT = { address: "el1qq_mine", key: KEY };
const AFTER = ["Fund", "Refresh"];
const WILL = { utxoType: "last_will", vout: 0 };
const [fund, refresh, coldBreak]: PresetStep[] = [
	{ action: "Fund", params: ({ key }) => ({ COLD_PUB_KEY: key }) },
	{ action: "Refresh", after: AFTER, spends: WILL },
	{ action: "ColdBreak", after: AFTER, spends: WILL },
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
		const request = will.request(fund!, ACCOUNT, {});

		expect(request).toMatchObject({
			action: "Fund",
			broadcast: true,
			params: { COLD_PUB_KEY: KEY },
		});
		expect(parseActionRequest(request).ok).toBe(true);
	});

	test("waits for the step whose output it spends", () => {
		expect(will.request(refresh!, ACCOUNT, {})).toBeUndefined();
	});

	test("spends the latest such output, under the contract the first step deployed", () => {
		expect(will.request(coldBreak!, ACCOUNT, { last_will: [funded, refreshed] })).toMatchObject({
			instance: { instance: { fields: funded.deployment, template: "last_will_contract" } },
			state: { utxos: [{ txid: refreshed.txid, utxo_type: "last_will", vout: 0 }] },
		});
	});

	test("is closed once a later step spent that output", () => {
		const broken = { action: "ColdBreak", spent: refreshed.txid, txid: "cc".repeat(32) };

		expect(
			will.request(refresh!, ACCOUNT, { last_will: [funded, refreshed, broken] }),
		).toBeUndefined();
	});

	test("reads its params from the latest step it builds on, without spending its output", () => {
		const reissue: PresetStep = {
			action: "Reissue",
			after: ["Mint"],
			params: (_account, earlier) => ({ entropy: earlier?.issuances?.[0]?.entropy }),
		};
		const issuance = {
			entropy: "ee".repeat(32),
			input: "mint_in",
			issuedAsset: "",
			reissuanceToken: "",
		};
		const minted = { action: "Mint", issuances: [issuance], txid: "dd".repeat(32) };
		const request = will.request(reissue, ACCOUNT, {
			last_will: [minted, { ...minted, action: "Reissue" }],
		});

		expect(request?.params).toEqual({ entropy: issuance.entropy });
		expect(request?.state).toBeUndefined();
		expect(will.request(reissue, ACCOUNT, {})).toBeUndefined();
	});

	test("builds on another preset's steps when it names that preset", () => {
		const offer: PresetStep = {
			action: "MakeOffer",
			after: ["Mint"],
			from: "multiasset",
			params: (_account, earlier) => ({ asset: earlier?.issuances?.[0]?.issuedAsset }),
		};
		const issuance = {
			entropy: "",
			input: "mint_in",
			issuedAsset: "ff".repeat(32),
			reissuanceToken: "",
		};
		const minted = { action: "Mint", issuances: [issuance], txid: "dd".repeat(32) };

		expect(will.request(offer, ACCOUNT, { multiasset: [minted] })?.params).toEqual({
			asset: issuance.issuedAsset,
		});
		expect(will.request(offer, ACCOUNT, { last_will: [minted] })).toBeUndefined();
	});
});
