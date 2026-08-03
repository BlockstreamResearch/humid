import { beforeAll, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

import * as smplxWasmBindings from "smplx-wasm/smplx_wasm_bg.js";

// Exercises the exact bindings `loadSmplxWasm` consumes. The only difference is where
// the module bytes come from: the extension fetches them through a Vite asset URL, this
// reads them off disk. Everything after instantiation — the `__wbg_set_wasm` handshake,
// the start call, and every exported binding — is the same code path.
//
// `loadSmplxWasm` itself cannot be imported here: it uses Vite's `?url` import, which
// only resolves under Vite.

type SmplxBindings = typeof import("smplx-wasm") & {
	__wbg_set_wasm: (exports: WebAssembly.Exports) => void;
};

const bindings = smplxWasmBindings as unknown as SmplxBindings;

// The reference value: this source compiled natively against simplicityhl 0.6.0 with
// debug symbols off. Asserting the wasm build reproduces it is what makes recomputing a
// covenant address in the wallet meaningful — a browser that derived a different CMR
// would refuse every legitimately deployed protocol.
const PROBE_SOURCE = "fn main() { assert!(jet::eq_32(witness::A, witness::B)); }";
const PROBE_CMR = "43041b02608dc3ba245a2e3dc7aa5bc991fcf6c097c6a165a18e97a486461729";

beforeAll(async () => {
	const require = createRequire(import.meta.url);
	const wasmPath = require.resolve("smplx-wasm/smplx_wasm_bg.wasm");
	const bytes = await readFile(wasmPath);

	const { instance } = await WebAssembly.instantiate(bytes, {
		"./smplx_wasm_bg.js": bindings as unknown as WebAssembly.ModuleImports,
	});

	bindings.__wbg_set_wasm(instance.exports);

	const start = instance.exports.__wbindgen_start;

	if (typeof start === "function") {
		start();
	}
});

describe("smplx wasm module", () => {
	test("reports the SDK version compiled into it", () => {
		expect(bindings.sdkVersion()).toBe("0.0.9");
	});

	test("compiles a contract to the same CMR as a native build", () => {
		const contract = new bindings.Contract(PROBE_SOURCE);

		expect(contract.commitmentMerkleRoot()).toBe(PROBE_CMR);
	});

	test("derives a covenant address", () => {
		const contract = new bindings.Contract(PROBE_SOURCE);
		const address = contract.covenantAddress("liquid-testnet");

		expect(address.startsWith("tex1p")).toBe(true);
	});

	test("refuses a source that does not compile", () => {
		const contract = new bindings.Contract("fn main() { this is not simplicityhl }");

		expect(() => contract.commitmentMerkleRoot()).toThrow();
	});

	test("rejects an unknown network by name", () => {
		const contract = new bindings.Contract(PROBE_SOURCE);

		expect(() => contract.covenantAddress("not-a-network")).toThrow();
	});
});
