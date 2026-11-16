import path from "node:path";

import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

import extensionConfig from "./vite.config";

const { resolve } = extensionConfig({ command: "serve", mode: "test" });

export default defineConfig({
	plugins: [storybookTest({ configDir: path.resolve(".storybook") })],
	resolve,
	test: {
		name: "storybook",
		fileParallelism: false,
		browser: {
			enabled: true,
			headless: true,
			provider: playwright(),
			instances: [{ browser: "chromium" }],
		},
	},
});
