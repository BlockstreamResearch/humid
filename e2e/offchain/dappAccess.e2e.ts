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

test("a locked wallet answers a dapp's read without opening a window", async ({
	context,
	dapp,
	wallet,
}) => {
	await dapp.connect();
	await wallet.lock();

	const opened = context.waitForEvent("page", { timeout: 3000 }).then(
		(page) => page.url(),
		() => null,
	);
	const read = dapp.page.evaluate(() =>
		(window as unknown as { humid: { request: (request: unknown) => Promise<unknown> } }).humid
			.request({
				method: "wallet_invokeMethod",
				params: {
					request: { method: "getBalance" },
					scope: "bip122:00902a6b70c2ca83b5d9c815d96a0e2f",
				},
			})
			.then(
				() => "answered",
				(error: { code?: number }) => error.code,
			),
	);

	expect(await read).toBe(4900);
	expect(await opened).toBeNull();
});
