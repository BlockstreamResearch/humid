// oxlint-disable no-underscore-dangle -- these are wasm-bindgen's own exported names; renaming them would stop the module loading
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

import * as smplxWasmBindings from "smplx-wasm/smplx_wasm_bg.js";

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
