// oxlint-disable no-underscore-dangle -- these are wasm-bindgen's own exported names; renaming them would stop the module loading
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

import * as smplxWasmBindings from "smplx-wasm/smplx_wasm_bg.js";

/**
 * The real smplx module, instantiated once for every test that needs it.
 *
 * **Once is not an optimisation.** The generated glue is a module, and a module is a singleton:
 * `__wbg_set_wasm` points it at one instance's exports, and every handle it hands out reads
 * that instance's memory. A second instantiation in the same process repoints the glue while
 * the first instance's objects are still alive, so they start reading a different memory —
 * which is not an error anywhere, just wrong values and torn objects.
 *
 * So the bootstrap lives here and the test files import it. Top-level await plus the module
 * cache is what makes that exactly-once: whichever test file is loaded first pays for it, and
 * the rest get the same instance.
 *
 * This is a test fixture rather than production loading. The extension fetches the module bytes
 * through a Vite asset URL, which only resolves under Vite; everything after instantiation —
 * the handshake, the start call, and every exported binding — is the same code path.
 */

type SmplxBindings = typeof import("smplx-wasm") & {
	__wbg_set_wasm: (exports: WebAssembly.Exports) => void;
};

const bindings = smplxWasmBindings as unknown as SmplxBindings;

const require = createRequire(import.meta.url);
const bytes = await readFile(require.resolve("smplx-wasm/smplx_wasm_bg.wasm"));

const { instance } = await WebAssembly.instantiate(bytes, {
	"./smplx_wasm_bg.js": bindings as unknown as WebAssembly.ModuleImports,
});

bindings.__wbg_set_wasm(instance.exports);

const start = instance.exports.__wbindgen_start;

if (typeof start === "function") {
	start();
}

export { bindings as smplx };
export type { SmplxBindings };
