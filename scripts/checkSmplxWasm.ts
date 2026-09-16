import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const built = join(root, "smplx/crates/wasm/pkg/smplx_wasm_bg.wasm");
const installed = join(root, "node_modules/smplx-wasm/smplx_wasm_bg.wasm");

function digestOf(path: string): string {
	try {
		return createHash("sha256").update(readFileSync(path)).digest("hex");
	} catch {
		return "";
	}
}

const builtDigest = digestOf(built);
const installedDigest = digestOf(installed);

if (builtDigest === "") {
	console.error(`No compiled smplx wasm at ${built}. Build it with: bun run build:wasm`);
	process.exit(1);
}

if (builtDigest !== installedDigest) {
	console.error("The installed smplx wasm is not the one that was last compiled.");
	console.error(`  compiled : ${builtDigest.slice(0, 16)}  ${built}`);
	console.error(`  installed: ${installedDigest.slice(0, 16) || "(absent)"}  ${installed}`);
	console.error("");
	console.error("The glue is hard-linked and the module is copied, so a rebuild updates only");
	console.error("half of it and every new argument is silently dropped. Fix with:");
	console.error("  bun install --force");
	process.exit(1);
}
