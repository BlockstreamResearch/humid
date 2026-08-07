import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { SMPLX_COMPILER_VERSION } from "./compilerVersion";

// The constant is the wallet's statement about which compiler the shipped module has, and a
// wallet wrong about that refuses manifests that should have built. Nothing in a wasm blob
// says which Rust dependency produced it, so the only thing that can contradict the constant
// is the manifest the submodule is built from — which is what this reads.
describe("the compiler version the wallet claims", () => {
	const workspaceManifest = join(import.meta.dir, "../../../../../../../..", "smplx", "Cargo.toml");

	function pinnedVersion(): string {
		const manifest = readFileSync(workspaceManifest, "utf8");
		const pin = /^simplicityhl\s*=\s*\{[^}]*version\s*=\s*"([^"]+)"/m.exec(manifest);

		if (!pin) {
			throw new Error(`No simplicityhl version pin found in ${workspaceManifest}`);
		}

		return pin[1];
	}

	it("matches the version the submodule's workspace pins", () => {
		expect(SMPLX_COMPILER_VERSION).toBe(pinnedVersion());
	});

	// Guards the reader rather than the value: a regex that stopped matching would make the
	// assertion above pass against nothing, which is the failure mode a drift test has.
	it("is read from the manifest rather than defaulted", () => {
		expect(pinnedVersion()).toMatch(/^\d+\.\d+/);
	});
});
