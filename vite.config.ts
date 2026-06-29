import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig } from "vite";
import { checker } from "vite-plugin-checker";
import webExtension, { readJsonFile } from "vite-plugin-web-extension";

const manifest = readJsonFile("src/manifest.json");

function isBuildWatchCommand() {
	return process.argv.includes("--watch") || process.argv.includes("-w");
}

function generateManifest() {
	const pkg = readJsonFile("package.json");
	return {
		name: pkg.name,
		description: pkg.description,
		version: pkg.version,
		...manifest,
	};
}

function getWebAccessibleResourceInputs() {
	return (
		manifest.web_accessible_resources
			?.flatMap((resource) => resource.resources ?? [])
			.filter(Boolean) ?? []
	);
}

function getAdditionalInputs() {
	return [...getWebAccessibleResourceInputs(), "src/notification.html"];
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
	const isDevelopment = mode === "development";
	const isAnalyze = mode === "analyze";
	const disableAutoLaunch =
		isBuildWatchCommand() && process.env.HUMID_EXTENSION_AUTO_LAUNCH !== "true";

	return {
		server: {
			sourcemapIgnoreList: false,
		},
		plugins: [
			react(),
			webExtension({
				manifest: generateManifest,
				additionalInputs: getAdditionalInputs(),
				disableAutoLaunch,
			}),
			tailwindcss(),
			{
				name: "markdown-loader",
				transform(code, id) {
					if (id.endsWith(".md")) {
						return `export default ${JSON.stringify(code)};`;
					}
				},
			},
			...(isDevelopment
				? [
						checker({
							overlay: {
								initialIsOpen: false,
							},
							typescript: true,
						}),
					]
				: []),
			...(isAnalyze
				? [
						visualizer({
							open: true,
						}),
					]
				: []),
		],
		resolve: {
			alias: {
				"@": path.resolve(process.cwd(), "src"),
				"@config": path.resolve(process.cwd(), "src/config.ts"),
				"@public": path.resolve(process.cwd(), "public"),
			},
			extensions: [".mjs", ".js", ".ts", ".jsx", ".tsx", ".json"],
			dedupe: ["react", "react-dom"],
			tsconfigPaths: true,
		},
		build: {
			target: "esnext",
			sourcemap: true,
		},
	};
});
