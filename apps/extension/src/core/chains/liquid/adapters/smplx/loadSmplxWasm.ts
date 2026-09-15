/* eslint-disable no-underscore-dangle */

import * as smplxWasmBindings from "smplx-wasm/smplx_wasm_bg.js";
import smplxWasmUrl from "smplx-wasm/smplx_wasm_bg.wasm?url";

export type SmplxWasmModule = typeof import("smplx-wasm");

type SmplxWasmBindings = SmplxWasmModule & {
	__wbg_set_wasm: (exports: WebAssembly.Exports) => void;
};

const bindings = smplxWasmBindings as unknown as SmplxWasmBindings;

let smplxWasmInitializePromise: Promise<void> | null = null;

/**
 * Loads the Simplex SDK wasm module, initializing it once per execution context.
 *
 * Deliberately mirrors `loadLwkWasm`: same streaming-with-fallback instantiation and the
 * same wasm-bindgen start handshake, because both modules are produced the same way and a
 * second shape here would be a difference nobody could explain later.
 *
 * Unlike lwk, this module needs no network, so it can be initialized in any context the
 * extension runs in rather than only where a `window` exists.
 */
export async function loadSmplxWasm(): Promise<SmplxWasmModule> {
	smplxWasmInitializePromise ??= initializeSmplxWasm();

	await smplxWasmInitializePromise;

	return bindings;
}

async function initializeSmplxWasm(): Promise<void> {
	const imports = {
		"./smplx_wasm_bg.js": bindings as unknown as WebAssembly.ModuleImports,
	};
	const instance = await instantiateSmplxWasm(imports);

	bindings.__wbg_set_wasm(instance.exports);
	startSmplxWasm(instance.exports);
}

async function instantiateSmplxWasm(imports: WebAssembly.Imports): Promise<WebAssembly.Instance> {
	const response = await fetch(smplxWasmUrl);

	try {
		const { instance } = await WebAssembly.instantiateStreaming(response, imports);

		return instance;
	} catch {
		const fallbackResponse = await fetch(smplxWasmUrl);
		const bytes = await fallbackResponse.arrayBuffer();
		const { instance } = await WebAssembly.instantiate(bytes, imports);

		return instance;
	}
}

function startSmplxWasm(exports: WebAssembly.Exports): void {
	const start = exports.__wbindgen_start;

	if (typeof start === "function") {
		start();
	}
}
