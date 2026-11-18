import type { LiquidProcessConfidentialTransactionResult } from "@humid/appkit-injected-adapter";
import { expect, type Page } from "@playwright/test";

import type { Dapp } from "../dapp";
import type { Wallet } from "../wallet";

export type SentAction = {
	result: LiquidProcessConfidentialTransactionResult;
	shownFeeSats: bigint;
};

export class PresetRunner {
	readonly #page: Page;
	readonly #wallet: Wallet;

	private constructor(page: Page, wallet: Wallet) {
		this.#page = page;
		this.#wallet = wallet;
	}

	static async open(dapp: Dapp, wallet: Wallet): Promise<PresetRunner> {
		const { page } = dapp;

		await page.getByRole("button", { name: "Process transaction" }).click();
		await page.getByRole("button", { name: "Use Local regtest" }).click();
		await page.getByRole("button", { name: "Read the wallet key" }).click();
		await expect(page.getByText(/^[0-9a-f]{64}$/)).toBeVisible();

		return new PresetRunner(page, wallet);
	}

	async send(preset: string, action: string): Promise<SentAction> {
		await this.#page
			.getByRole("group", { name: preset })
			.getByRole("button", { exact: true, name: action })
			.click();

		const confirmation = this.#wallet.nextConfirmation();

		await this.#page.getByRole("button", { name: "Send to wallet" }).click();

		const window = await confirmation;
		const shownFeeSats = await window.shownFeeSats();

		await window.approve("Sign and send");
		await window.done();

		const outcome = this.#page.getByText(/^(Result|Error)$/);

		await expect(outcome).toBeVisible();

		const text = await outcome.locator("..").locator("code").textContent();

		if ((await outcome.textContent()) === "Error") throw new Error(`${preset} ${action}: ${text}`);

		return {
			result: JSON.parse(text!) as LiquidProcessConfidentialTransactionResult,
			shownFeeSats,
		};
	}
}
