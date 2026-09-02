import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { SMPLX_COMPILER_VERSION } from "./compilerVersion";

// The constant is the wallet's statement about which compiler the shipped module has, and a
// wallet wrong about that refuses manifests that should have built. Nothing in a wasm blob
// says which Rust dependency produced it, so the only thing that can contradict the constant
// is the manifest the submodule is built from — which is what this reads.
describe("the compiler version the wallet claims", () => {
	// Relative to this file rather than to the process, because the whole suite runs from the
	// repository root and a package's own test must not depend on being run from there.
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

	// A wrong number of levels does not have to land on nothing. Cloning the signing module
	// beside its consumer is a normal thing to have done, and while this file was being moved a
	// wrong count found exactly that and passed against a manifest from another checkout. So the
	// root is checked to be this workspace before anything is read out of it.
	it("reads the submodule of this repository rather than another copy of it", () => {
		const workspace = readFileSync(join(repositoryRoot, "package.json"), "utf8");

		expect(JSON.parse(workspace).name).toBe("humid-workspace");
	});

	it("matches the version the submodule's workspace pins", () => {
		expect(SMPLX_COMPILER_VERSION).toBe(pinnedVersion());
	});

	// Guards the reader rather than the value: a regex that stopped matching would make the
	// assertion above pass against nothing, which is the failure mode a drift test has.
	it("is read from the manifest rather than defaulted", () => {
		expect(pinnedVersion()).toMatch(/^\d+\.\d+/);
	});
});
