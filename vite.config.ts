import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig } from "vite";
import { checker } from "vite-plugin-checker";
import webExtension, { readJsonFile } from "vite-plugin-web-extension";

// Paths passed to `readJsonFile` are resolved against process.cwd() (the workspace root), so they
// carry the `apps/extension/` prefix. Paths *inside* the manifest (and the additionalInputs below)
// are resolved against Vite's `root` (set to "apps/extension"), so those stay bare `src/...`.
const manifest = readJsonFile("apps/extension/src/manifest.json");

function isBuildWatchCommand() {
	return process.argv.includes("--watch") || process.argv.includes("-w");
}

function generateManifest() {
	const pkg = readJsonFile("apps/extension/package.json");
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
	return [...getWebAccessibleResourceInputs(), "src/notification.html", "src/offscreen.html"];
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
	const isDevelopment = mode === "development";
	const isAnalyze = mode === "analyze";
	const disableAutoLaunch =
		isBuildWatchCommand() && process.env.HUMID_EXTENSION_AUTO_LAUNCH !== "true";

	return {
		// Vite runs from the workspace root, but the extension's sources live in apps/extension. Point
		// `root` there so the manifest's bare `src/...` entry paths resolve and the emitted bundle stays
		// structured as a plain extension (dist/src/..., dist/icon/...).
		root: "apps/extension",
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
				"@": path.resolve(process.cwd(), "apps/extension/src"),
				"@config": path.resolve(process.cwd(), "apps/extension/src/config.ts"),
				"@public": path.resolve(process.cwd(), "apps/extension/public"),
			},
			extensions: [".mjs", ".js", ".ts", ".jsx", ".tsx", ".json"],
			dedupe: ["react", "react-dom"],
			tsconfigPaths: true,
		},
		build: {
			target: "esnext",
			sourcemap: true,
			// Hoist the output out of `root` (apps/extension) back to the workspace-root dist/, so the
			// unpacked extension keeps loading from humid/dist as before. `emptyOutDir` is required
			// because the target lives outside Vite's `root`.
			outDir: path.resolve(process.cwd(), "dist"),
			emptyOutDir: true,
		},
	};
});
