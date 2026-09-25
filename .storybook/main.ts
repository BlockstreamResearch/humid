import path from "node:path";

import type { StorybookConfig } from "@storybook/react-vite";
import tailwindcss from "@tailwindcss/vite";
import type { PluginOption } from "vite";

const rootDir = process.cwd();

const EXCLUDED_PLUGIN_HINTS = ["web-extension", "checker", "visualizer"];

function stripProjectOnlyPlugins(plugins: PluginOption[]): PluginOption[] {
	return plugins.flat(Number.POSITIVE_INFINITY).filter((plugin) => {
		if (!plugin || typeof plugin !== "object" || !("name" in plugin)) return true;

		return !EXCLUDED_PLUGIN_HINTS.some((hint) => plugin.name.includes(hint));
	}) as PluginOption[];
}

function hasPlugin(plugins: PluginOption[], hint: string): boolean {
	return plugins.flat(Number.POSITIVE_INFINITY).some((plugin) => {
		return Boolean(plugin) && typeof plugin === "object" && "name" in plugin
			? plugin.name.includes(hint)
			: false;
	});
}

const config: StorybookConfig = {
	framework: {
		name: "@storybook/react-vite",
		options: {},
	},
	stories: ["../apps/extension/src/**/*.stories.@(ts|tsx)"],
	addons: [],
	core: {
		disableTelemetry: true,
	},
	viteFinal(viteConfig) {
		const portFlagIndex = process.argv.findIndex((arg) => arg === "-p" || arg === "--port");
		const storybookPort = portFlagIndex >= 0 ? (process.argv[portFlagIndex + 1] ?? "6006") : "6006";
		viteConfig.cacheDir = path.resolve(
			rootDir,
			`node_modules/.cache/storybook-vite-${storybookPort}`,
		);

		const plugins = stripProjectOnlyPlugins(viteConfig.plugins ?? []);

		if (!hasPlugin(plugins, "tailwind")) {
			plugins.push(tailwindcss());
		}

		viteConfig.plugins = plugins;

		const existingAlias = viteConfig.resolve?.alias;
		const existingEntries = Array.isArray(existingAlias)
			? existingAlias
			: Object.entries(existingAlias ?? {}).map(([find, replacement]) => ({ find, replacement }));

		viteConfig.resolve = viteConfig.resolve ?? {};
		viteConfig.resolve.alias = [
			{
				find: "webextension-polyfill",
				replacement: path.resolve(rootDir, ".storybook/mocks/webextension-polyfill.ts"),
			},
			{
				find: "@/core/secure-vault/application/wallet-vault/client",
				replacement: path.resolve(rootDir, ".storybook/mocks/vault.ts"),
			},
			{
				find: "@/core/extension-rpc",
				replacement: path.resolve(rootDir, ".storybook/mocks/extension-rpc.ts"),
			},
			...existingEntries,
		];

		return viteConfig;
	},
};

export default config;
