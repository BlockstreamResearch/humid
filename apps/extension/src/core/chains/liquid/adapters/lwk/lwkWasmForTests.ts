// oxlint-disable no-underscore-dangle -- these are wasm-bindgen's own exported names; renaming them would stop the module loading
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

import * as lwkWasmBindings from "lwk_wasm/lwk_wasm_bg.js";

type LwkBindings = typeof import("lwk_wasm") & {
	__wbg_set_wasm: (exports: WebAssembly.Exports) => void;
};

const bindings = lwkWasmBindings as unknown as LwkBindings;

const require = createRequire(import.meta.url);
const bytes = await readFile(require.resolve("lwk_wasm/lwk_wasm_bg.wasm"));

const { instance } = await WebAssembly.instantiate(bytes, {
	"./lwk_wasm_bg.js": bindings as unknown as WebAssembly.ModuleImports,
});

bindings.__wbg_set_wasm(instance.exports);

const start = instance.exports.__wbindgen_start;

if (typeof start === "function") {
	start();
}

export { bindings as lwk };
export type { LwkBindings };
