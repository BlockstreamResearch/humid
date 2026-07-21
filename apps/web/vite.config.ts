import path from "path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
	plugins: [react(), tailwindcss()],
	// liquidjs-lib (coin-control PSET builder) is a CJS bundle that references the Node `global` and
	// `Buffer`. `global` is aliased to `globalThis` here; `Buffer` is polyfilled in `src/polyfills.ts`.
	define: {
		global: "globalThis",
	},
	optimizeDeps: {
		include: ["buffer", "liquidjs-lib"],
	},
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
});
