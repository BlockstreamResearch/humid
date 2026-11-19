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

	async send(preset: string, action: string, { broadcast = true } = {}): Promise<SentAction> {
		await this.#page
			.getByRole("group", { name: preset })
			.getByRole("button", { exact: true, name: action })
			.click();

		if (!broadcast) {
			const request = this.#page.getByLabel("Or paste the request JSON");

			await request.fill(
				(await request.inputValue()).replace('"broadcast": true', '"broadcast": false'),
			);
		}

		const confirmation = this.#wallet.nextConfirmation();

		await this.#page.getByRole("button", { name: "Send to wallet" }).click();

		const refused = this.#outcome(/^Error$/)
			.waitFor({ timeout: 0 })
			.then(async () => {
				throw new Error(`${preset} ${action}: ${await this.#shown(/^Error$/)}`);
			});

		refused.catch(() => {});

		const window = await Promise.race([confirmation, refused]);
		const shownFeeSats = await Promise.race([window.shownFeeSats(), refused]);

		await window.approve(broadcast ? "Sign and send" : "Sign");
		await window.done();

		const outcome = this.#outcome(/^(Result|Error)$/);

		await expect(outcome).toBeVisible();

		const text = await this.#shown(/^(Result|Error)$/);

		if ((await outcome.textContent()) === "Error") throw new Error(`${preset} ${action}: ${text}`);

		return {
			result: JSON.parse(text!) as LiquidProcessConfidentialTransactionResult,
			shownFeeSats,
		};
	}

	#outcome(label: RegExp) {
		return this.#page.getByText(label);
	}

	async #shown(label: RegExp): Promise<string | null> {
		return this.#outcome(label).locator("..").locator("code").textContent();
	}
}
