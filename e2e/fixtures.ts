import { existsSync } from "node:fs";
import path from "node:path";

import { type BrowserContext, chromium, test as base } from "@playwright/test";

import { Dapp } from "./dapp";
import { Wallet } from "./wallet";

const EXTENSION_DIR = path.resolve(import.meta.dirname, "../dist");

export const test = base.extend<{ context: BrowserContext; dapp: Dapp; wallet: Wallet }>({
	// eslint-disable-next-line no-empty-pattern -- Playwright reads fixture dependencies from the pattern.
	context: async ({}, use) => {
		if (!existsSync(path.join(EXTENSION_DIR, "manifest.json"))) {
			throw new Error("The extension is not built. Run bun run build first.");
		}

		const context = await chromium.launchPersistentContext("", {
			args: [`--disable-extensions-except=${EXTENSION_DIR}`, `--load-extension=${EXTENSION_DIR}`],
			channel: "chromium",
		});

		await use(context);
		await context.close();
	},
	wallet: async ({ context }, use) => {
		const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));

		await use(new Wallet(context, new URL(worker.url()).host));
	},
	dapp: async ({ context, wallet }, use) => {
		await use(await Dapp.open(context, wallet));
	},
});

export { expect } from "@playwright/test";
