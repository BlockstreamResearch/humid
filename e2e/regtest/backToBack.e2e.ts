import { expect, test } from "../fixtures";
import { confirmedTransaction } from "./esplora";
import { PresetRunner } from "./presetRunner";

test("back-to-back spends each take coins the other left", async ({ dapp, wallet }) => {
	await wallet.restore();
	await dapp.connect();

	const runner = await PresetRunner.open(dapp, wallet);
	const sent = [await runner.send("p2pk", "Pay"), await runner.send("p2pk", "Pay")];

	for (const { result, shownFeeSats } of sent) {
		expect(BigInt((await confirmedTransaction(result.txid)).fee)).toBe(shownFeeSats);
	}
});
