import { expect, test } from "../fixtures";
import { confirmedTransaction } from "./esplora";
import { PresetRunner } from "./presetRunner";

test("Activity names the dapp behind each action, and a signed one holds its coins until released", async ({
	dapp,
	wallet,
}) => {
	await wallet.restore();
	await dapp.connect();

	const runner = await PresetRunner.open(dapp, wallet);
	const { result: sent } = await runner.send("p2pk", "Pay");

	await confirmedTransaction(sent.txid);
	await runner.send("p2pk", "Pay", { broadcast: false });

	const home = await wallet.home("Local regtest");

	await home.getByRole("button", { name: "Refresh balances" }).click();
	await expect(home.getByText(/^Updated/)).toBeVisible({ timeout: 60_000 });
	await home.getByRole("link", { name: /Activity/ }).click();

	const held = home.getByText(/^Signed .*, not sent$/);

	await expect(held).toBeVisible();
	await expect(home.getByText("Pay · localhost:5199")).toHaveCount(2);

	await held.click();
	await home.getByRole("button", { name: "Release" }).click();

	await expect(held).toBeHidden();
	await expect(home.getByText("Pay · localhost:5199")).toHaveCount(1);
});
