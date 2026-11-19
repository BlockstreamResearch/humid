import { expect, test } from "../fixtures";
import { confirmedTransaction } from "./esplora";
import { PresetRunner } from "./presetRunner";

const LIFECYCLES = [
	{ preset: "p2pk", actions: ["Pay", "Receive"] },
	{ preset: "last_will", actions: ["Fund", "Refresh", "ColdBreak", "Fund", "Inherit"] },
	{ preset: "multiasset", actions: ["MintReissuable", "Reissue", "Reissue", "PayToken"] },
	{ preset: "dex", actions: ["MakeOffer", "Settle", "ClaimPayout", "MakeOffer", "Refund"] },
];

for (const { preset, actions } of LIFECYCLES) {
	test(`${preset} runs ${actions.join(" → ")} on-chain at the shown fee`, async ({
		dapp,
		wallet,
	}) => {
		await wallet.restore();
		await dapp.connect();

		const runner = await PresetRunner.open(dapp, wallet);

		for (const action of actions) {
			await test.step(action, async () => {
				const { result, shownFeeSats } = await runner.send(preset, action);

				expect(result.broadcast).toBe(true);
				expect(BigInt(result.feeSats)).toBe(shownFeeSats);
				expect(BigInt((await confirmedTransaction(result.txid)).fee)).toBe(shownFeeSats);
			});
		}
	});
}
