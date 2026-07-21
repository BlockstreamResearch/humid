import path from "path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";

// https://vite.dev/config/
export default defineConfig({
	plugins: [
		react(),
		tailwindcss(),
		// liquidjs-lib (coin-control PSET builder) reaches Node's crypto stack — create-hash →
		// hash-base → readable-stream — which needs Buffer/process/stream/util/events in the browser.
		nodePolyfills({ globals: { Buffer: true, global: true, process: true } }),
	],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
});
