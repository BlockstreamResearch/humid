import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { SMPLX_COMPILER_VERSION } from "./compilerVersion";

describe("the compiler version the wallet claims", () => {
	const repositoryRoot = join(import.meta.dir, "../../..");
	const workspaceManifest = join(repositoryRoot, "smplx", "Cargo.toml");

	function pinnedVersion(): string {
		const manifest = readFileSync(workspaceManifest, "utf8");
		const pin = /^simplicityhl\s*=\s*\{[^}]*version\s*=\s*"([^"]+)"/m.exec(manifest);

		if (!pin) {
			throw new Error(`No simplicityhl version pin found in ${workspaceManifest}`);
		}

		return pin[1];
	}

	it("reads the submodule of this repository rather than another copy of it", () => {
		const workspace = readFileSync(join(repositoryRoot, "package.json"), "utf8");

		expect(JSON.parse(workspace).name).toBe("humid-workspace");
	});

	it("matches the version the submodule's workspace pins", () => {
		expect(SMPLX_COMPILER_VERSION).toBe(pinnedVersion());
	});

	it("is read from the manifest rather than defaulted", () => {
		expect(pinnedVersion()).toMatch(/^\d+\.\d+/);
	});
});
