import { describe, expect, test } from "bun:test";

import type { Action } from "../document/manifest";
import { actionOf } from "../review/reviewForTests";
import { resolveParameters } from "./parameters";

const WALLET = { address: "tex1q_mine", key: "aa".repeat(32), script_hash: "bb".repeat(32) };

const filling = (supplied: Record<string, unknown>) => {
	const action: Action = actionOf("Act", {
		params: {
			HASH: { compute: { type: "wallet", wallet: "script_hash" } },
			KEY: { compute: { type: "wallet", wallet: "key" } },
			PAYOUT: { compute: { type: "wallet", wallet: "address" } },
		},
	});

	return resolveParameters(
		action,
		supplied,
		{},
		{
			contractSources: {},
			declaredTypes: {},
			hashProgram: () => "",
			readAddress: () => ({ scriptPubKeyHex: "" }),
			wallet: WALLET,
		},
	);
};

describe("a parameter the wallet fills", () => {
	test("takes the wallet's own key, address and script hash", () => {
		expect(filling({})).toEqual({
			HASH: WALLET.script_hash,
			KEY: WALLET.key,
			PAYOUT: WALLET.address,
		});
	});

	test("keeps the wallet's value over one the request sent", () => {
		expect(filling({ KEY: "cc".repeat(32) }).KEY).toBe(WALLET.key);
	});
});

describe("a parameter computed from a script", () => {
	const computing = (compute: Record<string, unknown>, supplied: Record<string, unknown> = {}) =>
		resolveParameters(
			actionOf("Act", {
				params: {
					HASH: { compute, type: "bytes32" },
					KEY: { compute: { type: "wallet", wallet: "key" }, type: "pubkey" },
					payee: { type: "address" },
				},
			}),
			supplied,
			{},
			{
				contractSources: { "./vault.simf": "fn main() {}" },
				declaredTypes: { KEY: "pubkey" },
				hashProgram: ({ argumentsJson }) =>
					(argumentsJson.includes(WALLET.key) ? "dd" : "00").repeat(32),
				readAddress: (address) => ({ scriptPubKeyHex: address === "el1_payee" ? "51" : "" }),
				wallet: WALLET,
			},
		).HASH;

	test("hashes the script an address pays", () => {
		expect(
			computing({ address: "params.payee", type: "script_hash" }, { payee: "el1_payee" }),
		).toBe("4ae81572f06e1b88fd5ced7a1a000945432e83e1551e6f721ee9c00b8cc33260");
	});

	test("hashes a contract built from a value the wallet filled", () => {
		expect(
			computing({
				params: { PUB_KEY: { type: "pubkey", value: "params.KEY" } },
				simf: "./vault.simf",
				type: "tapleaf",
			}),
		).toBe("dd".repeat(32));
	});
});
