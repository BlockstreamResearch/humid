import { expect, test } from "../fixtures";

test.beforeEach(async ({ wallet }) => {
	await wallet.restore();
});

test("a dapp connects once the wallet approves", async ({ dapp }) => {
	await dapp.connect();
});

test("a connection offers reading addresses without a prompt", async ({ dapp, wallet }) => {
	const confirmation = wallet.nextConfirmation();

	await dapp.page.getByRole("button", { name: "Connect wallet" }).click();
	await dapp.page.getByText("Humid Extension").click();

	await expect((await confirmation).permission(/view addresses/i)).toBeChecked();
});

test("a rejected connection reaches the dapp as a failure", async ({ dapp, wallet }) => {
	const confirmation = wallet.nextConfirmation();

	await dapp.page.getByRole("button", { name: "Connect wallet" }).click();
	await dapp.page.getByText("Humid Extension").click();
	await (await confirmation).reject();

	await expect(dapp.page.getByText("Couldn't connect")).toBeVisible();
	await expect(dapp.page.getByRole("button", { name: "Connect wallet" })).toBeEnabled();
});
