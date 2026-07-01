import path from "node:path";

import type { StorybookConfig } from "@storybook/react-vite";
import tailwindcss from "@tailwindcss/vite";
import type { PluginOption } from "vite";

const rootDir = process.cwd();

// Plugins from the project's vite.config that must not run inside Storybook.
// `vite-plugin-web-extension` injects the extension entry points (popup,
// background) as build inputs, which drags the whole app — including the real
// vault store — into the Storybook bundle and defeats the mock alias below.
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
	stories: ["../src/**/*.stories.@(ts|tsx)"],
	addons: [],
	core: {
		disableTelemetry: true,
	},
	viteFinal(viteConfig) {
		// Give each Storybook instance (the dev server vs the verification server) its
		// own Vite dep-optimization cache, keyed by port. A shared cache lets one
		// instance's re-optimize (e.g. after installing a dependency) strand the other
		// with a stale, half-aliased bundle — which surfaces as the runtime
		// "initPegasusTransport" error from the real extension-rpc module.
		const portFlagIndex = process.argv.findIndex((arg) => arg === "-p" || arg === "--port");
		const storybookPort = portFlagIndex >= 0 ? (process.argv[portFlagIndex + 1] ?? "6006") : "6006";
		viteConfig.cacheDir = path.resolve(
			rootDir,
			`node_modules/.cache/storybook-vite-${storybookPort}`,
		);

		const plugins = stripProjectOnlyPlugins(viteConfig.plugins ?? []);

		// Tailwind v4 is supplied by the project config; only add it if stripping
		// removed it or it was never present.
		if (!hasPlugin(plugins, "tailwind")) {
			plugins.push(tailwindcss());
		}

		viteConfig.plugins = plugins;

		const existingAlias = viteConfig.resolve?.alias;
		const existingEntries = Array.isArray(existingAlias)
			? existingAlias
			: Object.entries(existingAlias ?? {}).map(([find, replacement]) => ({ find, replacement }));

		viteConfig.resolve = viteConfig.resolve ?? {};
		// Prepend mocks so they intercept before the project's generic "@" -> "src"
		// alias resolves the real modules (which pull the extension runtime).
		// String aliases are used because the rolldown-based Vite 8 resolver does
		// not honor regex finds.
		viteConfig.resolve.alias = [
			// The real webextension-polyfill throws at import outside an extension;
			// stub it so any page that transitively imports it renders.
			{
				find: "webextension-polyfill",
				replacement: path.resolve(rootDir, ".storybook/mocks/webextension-polyfill.ts"),
			},
			// The wallet-vault client (create/unlock/lock/reset) — driven by the
			// configurable vault mock instead of the real pegasus transport.
			{
				find: "@/core/secure-vault/application/wallet-vault/client",
				replacement: path.resolve(rootDir, ".storybook/mocks/vault.ts"),
			},
			// The RPC entry point calls definePegasusMessageBus() at import, which throws
			// outside an extension. Stub it; stories use mock data, not the real transport.
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
