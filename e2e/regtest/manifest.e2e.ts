import { expect, test } from "../fixtures";
import { confirmedTransaction } from "./esplora";
import { PresetRunner } from "./presetRunner";

const LIFECYCLES = [
	[{ preset: "p2pk", actions: ["Pay", "Receive"] }],
	[{ preset: "last_will", actions: ["Fund", "Refresh", "ColdBreak", "Fund", "Inherit"] }],
	[{ preset: "multiasset", actions: ["MintReissuable", "Reissue", "Reissue", "PayToken"] }],
	[
		{ preset: "multiasset", actions: ["MintReissuable"] },
		{ preset: "dex", actions: ["MakeOffer", "Settle", "ClaimPayout", "MakeOffer", "Refund"] },
	],
];

for (const runs of LIFECYCLES) {
	const title = runs
		.map(({ preset, actions }) => `${preset} ${actions.join(" → ")}`)
		.join(", then ");

	test(`${title} goes on-chain at the shown fee`, async ({ dapp, wallet }) => {
		await wallet.restore();
		await dapp.connect();

		const runner = await PresetRunner.open(dapp, wallet);

		for (const { preset, actions } of runs) {
			for (const action of actions) {
				await test.step(`${preset} ${action}`, async () => {
					const { result, shownFeeSats } = await runner.send(preset, action);

					expect(result.broadcast).toBe(true);
					expect(BigInt(result.feeSats)).toBe(shownFeeSats);
					expect(BigInt((await confirmedTransaction(result.txid)).fee)).toBe(shownFeeSats);
				});
			}
		}
	});
}
