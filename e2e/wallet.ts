import { type BrowserContext, expect, type Locator, type Page } from "@playwright/test";

// Funded by bun run regtest. The phrase is public, so it never holds real funds.
export const RECOVERY_PHRASE =
	"abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

const PASSWORD = "e2e-password";

export class Wallet {
	readonly #context: BrowserContext;
	readonly #extensionId: string;

	constructor(context: BrowserContext, extensionId: string) {
		this.#context = context;
		this.#extensionId = extensionId;
	}

	async restore(phrase = RECOVERY_PHRASE): Promise<void> {
		const page = await this.#context.newPage();

		await page.goto(`chrome-extension://${this.#extensionId}/src/popup.html?tab#/auth/create`);
		await page.getByRole("tab", { name: "Import" }).click();
		await page.getByRole("textbox").first().fill(phrase);
		await page.getByRole("button", { name: "Continue" }).click();
		await page.getByPlaceholder("Create password").fill(PASSWORD);
		await page.getByPlaceholder("Repeat password").fill(PASSWORD);
		await page.getByRole("button", { name: "Create wallet" }).click();
		await expect(page).toHaveURL(/#\/app/);
		await page.close();
	}

	async nextConfirmation(): Promise<Confirmation> {
		for (;;) {
			const page = await this.#context.waitForEvent("page", { timeout: 60_000 });

			await page.waitForLoadState("domcontentloaded");

			if (page.url().includes("/notification.html")) return new Confirmation(page);
		}
	}
}

export class Confirmation {
	readonly #page: Page;

	constructor(page: Page) {
		this.#page = page;
	}

	async approve(label: string): Promise<void> {
		await this.#page.getByRole("button", { exact: true, name: label }).click();
	}

	permission(name: RegExp): Locator {
		return this.#page.getByRole("checkbox", { name });
	}

	async reject(): Promise<void> {
		await this.#page.getByRole("button", { exact: true, name: "Reject" }).click();
	}

	async shownFeeSats(): Promise<bigint> {
		const fee = await this.#page
			.getByText(/^\d+ sats$/)
			.first()
			.textContent();

		return BigInt(fee!.split(" ")[0]!);
	}

	async done(): Promise<void> {
		const done = this.#page.getByRole("button", { exact: true, name: "Done" });
		const failure = this.#page.getByRole("heading", { name: "The request failed" });

		await expect(done.or(failure)).toBeVisible({ timeout: 120_000 });

		if (await failure.isVisible()) {
			throw new Error(await failure.locator("..").innerText());
		}

		await done.click();
	}
}
