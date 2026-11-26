import { defineConfig } from "@playwright/test";

import { DAPP_URL } from "./dapp";
import { ESPLORA_URL } from "./regtest/esplora";

const REGTEST = process.env.E2E_REGTEST === "1";

export default defineConfig({
	testDir: REGTEST ? "regtest" : "offchain",
	testMatch: "*.e2e.ts",
	workers: 1,
	timeout: REGTEST ? 300_000 : 60_000,
	expect: { timeout: 30_000 },
	reporter: [["list"]],
	webServer: [
		{
			command: "bun --filter=./apps/web run dev -- --port 5199 --strictPort",
			cwd: "..",
			reuseExistingServer: true,
			url: DAPP_URL,
		},
		...(REGTEST
			? [
					{
						command: "bun run regtest",
						cwd: "..",
						reuseExistingServer: true,
						timeout: 180_000,
						url: `${ESPLORA_URL}/blocks/tip/height`,
					},
				]
			: []),
	],
});
