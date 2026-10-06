import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

type WasmPackage = {
	built: string;
	installed: string;
	buildScript: string;
	/** Declarations that must exist in the built package, with why they are required. */
	requiredDeclarations?: { declarationsFile: string; markers: string[]; reason: string };
};

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const packages: Record<string, WasmPackage> = {
	lwk: {
		built: "lwk/lwk_wasm/pkg/lwk_wasm_bg.wasm",
		installed: "node_modules/lwk_wasm/lwk_wasm_bg.wasm",
		buildScript: "build:wasm:lwk",
		requiredDeclarations: {
			declarationsFile: "lwk/lwk_wasm/pkg/lwk_wasm.d.ts",
			markers: ["export class PsetBuilder ", "export class SecretKey "],
			reason:
				"it was built without the `simplicity` feature, which the extension's PSET code needs",
		},
	},
	smplx: {
		built: "smplx/crates/wasm/pkg/smplx_wasm_bg.wasm",
		installed: "node_modules/smplx-wasm/smplx_wasm_bg.wasm",
		buildScript: "build:wasm:smplx",
	},
};

const name = process.argv[2] ?? "";
const wasmPackage = packages[name];

if (!wasmPackage) {
	console.error(`Usage: bun run scripts/checkWasm.ts <${Object.keys(packages).join("|")}>`);
	process.exit(1);
}

function digestOf(path: string): string {
	try {
		return createHash("sha256")
			.update(readFileSync(join(root, path)))
			.digest("hex");
	} catch {
		return "";
	}
}

const builtDigest = digestOf(wasmPackage.built);
const installedDigest = digestOf(wasmPackage.installed);

if (builtDigest === "") {
	console.error(`No compiled ${name} wasm at ${wasmPackage.built}. Build it with:`);
	console.error(`  bun run ${wasmPackage.buildScript} && bun install --force`);
	process.exit(1);
}

const required = wasmPackage.requiredDeclarations;
if (required) {
	let declarations = "";
	try {
		declarations = readFileSync(join(root, required.declarationsFile), "utf8");
	} catch {
		// An unreadable declarations file is reported below as every marker missing.
	}
	const missing = required.markers.filter((marker) => !declarations.includes(marker));

	if (missing.length > 0) {
		console.error(`The compiled ${name} wasm is unusable: ${required.reason}.`);
		console.error(
			`  missing in ${required.declarationsFile}: ${missing.map((m) => m.trim()).join(", ")}`,
		);
		console.error("");
		console.error("Rebuild it with:");
		console.error(`  bun run ${wasmPackage.buildScript} && bun install --force`);
		process.exit(1);
	}
}

if (builtDigest !== installedDigest) {
	console.error(`The installed ${name} wasm is not the one that was last compiled.`);
	console.error(`  compiled : ${builtDigest.slice(0, 16)}  ${wasmPackage.built}`);
	console.error(
		`  installed: ${installedDigest.slice(0, 16) || "(absent)"}  ${wasmPackage.installed}`,
	);
	console.error("");
	console.error("The glue is hard-linked and the module is copied, so a rebuild updates only");
	console.error("half of it and every new argument is silently dropped. Fix with:");
	console.error("  bun install --force");
	process.exit(1);
}
