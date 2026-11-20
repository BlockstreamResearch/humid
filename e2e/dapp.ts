import { type BrowserContext, expect, type Page } from "@playwright/test";

import type { Wallet } from "./wallet";

export const DAPP_URL = "http://localhost:5199";

export class Dapp {
	readonly page: Page;
	readonly #wallet: Wallet;

	private constructor(page: Page, wallet: Wallet) {
		this.page = page;
		this.#wallet = wallet;
	}

	static async open(context: BrowserContext, wallet: Wallet): Promise<Dapp> {
		const page = await context.newPage();

		await page.goto(DAPP_URL);

		return new Dapp(page, wallet);
	}

	async connect(): Promise<void> {
		const confirmation = this.#wallet.nextConfirmation();

		await this.page.getByRole("button", { name: "Connect wallet" }).click();
		await this.page.getByText("Humid Extension").click();
		await (await confirmation).approve("Connect");
		await expect(this.page.getByRole("button", { name: "Connect wallet" })).toBeHidden();
	}
}
