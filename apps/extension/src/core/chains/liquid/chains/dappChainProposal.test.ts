import { describe, expect, test } from "bun:test";

import { createBuiltInLiquidChains } from "./createBuiltInLiquidChains";
import { parseDappChainProposal } from "./dappChainProposal";

const BUILT_IN = createBuiltInLiquidChains();

const propose = (settings: Record<string, unknown>, name = "Dapp regtest") =>
	parseDappChainProposal({ name, settings }, BUILT_IN);

describe("a network a dapp asks to add", () => {
	test("is a regtest one, whether or not the dapp names the type", () => {
		expect(propose({ backend: { url: "https://esplora.example.org" } }).settings.network).toBe(
			"regtest",
		);
		expect(
			propose({ backend: { url: "https://esplora.example.org" }, network: "regtest" }).settings
				.network,
		).toBe("regtest");
	});

	test("is refused as mainnet or testnet, since it would share their keys", () => {
		for (const network of ["mainnet", "testnet"]) {
			expect(() => propose({ backend: { url: "https://esplora.example.org" }, network })).toThrow(
				"A dapp can add regtest networks only.",
			);
		}
	});

	test("reaches its backend and explorer over https, or plain http on this computer only", () => {
		for (const url of ["http://localhost:3000", "http://127.0.0.1:3000", "http://[::1]:3000"]) {
			expect(propose({ backend: { url } }).settings.backend.url).toBe(url);
		}

		expect(() => propose({ backend: { url: "http://esplora.example.org" } })).toThrow(
			"The backend must use https",
		);
		expect(() =>
			propose({
				backend: { url: "https://esplora.example.org" },
				explorerUrl: "javascript:alert(1)",
			}),
		).toThrow("The explorer must use https");
		expect(() => propose({ backend: { url: "esplora" } })).toThrow("is not a URL");
	});

	test("never takes the name of a network the wallet already has", () => {
		for (const name of ["Liquid", " liquid testnet ", "LOCAL REGTEST"]) {
			expect(() => propose({ backend: { url: "https://esplora.example.org" } }, name)).toThrow(
				"The wallet already has a network named",
			);
		}
	});
});
