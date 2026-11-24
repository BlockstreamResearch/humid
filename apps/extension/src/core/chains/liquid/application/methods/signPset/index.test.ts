import { expect, test } from "bun:test";

import { DENY_ALL_AUTHORIZATION } from "@/core/wallet-rpc/types";

import { signLiquidPset } from ".";
import type { LiquidSignPsetReview } from "../../../domain/pset/types";

const INPUTS: LiquidSignPsetReview["inputs"] = [
	{ index: 0, owned: false, sighashType: 1 },
	{ index: 1, owned: true, sighashType: 0x83 },
];

function request(signInputs: { index: number; sighashTypes?: number[] }[]) {
	let prompted = false;
	const context = {
		authorization: DENY_ALL_AUTHORIZATION,
		chain: { id: "liquid:testnet", name: "Liquid Testnet" },
		// Like the real window: it waits for the review, and fails with it when the review refuses.
		confirm: async (request: Promise<unknown>) => {
			await request;
			prompted = true;

			return { approved: false };
		},
		keyManagerState: {},
		walletBackend: {
			blindAndInspectPset: async () => ({
				fees: [],
				inputs: INPUTS,
				issuances: [],
				netEffect: [],
				outputs: [],
				pset: "reviewed",
			}),
			resolveAccount: async () => ({}),
			syncAccount: async () => {},
		},
	} as never;
	const result = signLiquidPset(
		{ pset: "dapp", signInputs: signInputs.map((input) => ({ address: "a", ...input })) },
		context,
	);

	return { prompted: () => prompted, result };
}

test("refuses, instead of asking for approval, an input that is not this account's or an undeclared sighash", async () => {
	for (const [signInputs, refusal] of [
		[[{ index: 0 }], "The input at index 0 is not this account's"],
		[[{ index: 1 }], "The input at index 1 uses sighash 131"],
		[[{ index: 5 }], "The transaction has no input at index 5"],
	] as const) {
		const asked = request([...signInputs]);

		await expect(asked.result).rejects.toThrow(refusal);
		expect(asked.prompted()).toBe(false);
	}
});

test("asks the user once each listed input is this account's and its sighash was declared", async () => {
	const asked = request([{ index: 1, sighashTypes: [0x83] }]);

	await expect(asked.result).rejects.toThrow();
	expect(asked.prompted()).toBe(true);
});
