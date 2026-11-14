import { describe, expect, test } from "bun:test";

import type { Action } from "../document/manifest";
import { actionOf } from "../review/reviewForTests";
import { Scope } from "../values/scope";
import { fillParameters } from "./parameters";

const WALLET = { address: "tex1q_mine", key: "aa".repeat(32), script_hash: "bb".repeat(32) };

const filling = (supplied: Record<string, unknown>) => {
	const action: Action = actionOf("Act", {
		params: {
			HASH: { compute: { type: "wallet", wallet: "script_hash" } },
			KEY: { compute: { type: "wallet", wallet: "key" } },
			PAYOUT: { compute: { type: "wallet", wallet: "address" } },
		},
	});

	return fillParameters(action, supplied, new Scope({ params: supplied }), WALLET);
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
