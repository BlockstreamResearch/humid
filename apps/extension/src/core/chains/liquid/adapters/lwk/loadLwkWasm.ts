/* eslint-disable no-underscore-dangle */

import * as lwkWasmBindings from "lwk_wasm/lwk_wasm_bg.js";
import lwkWasmUrl from "lwk_wasm/lwk_wasm_bg.wasm?url";

export type LwkWasmModule = typeof import("lwk_wasm");

type LwkWasmBindings = LwkWasmModule & {
	__wbg_set_wasm: (exports: WebAssembly.Exports) => void;
};

const bindings = lwkWasmBindings as unknown as LwkWasmBindings;

let lwkWasmInitializePromise: Promise<void> | null = null;

export async function loadLwkWasm(): Promise<LwkWasmModule> {
	lwkWasmInitializePromise ??= initializeLwkWasm();

	await lwkWasmInitializePromise;

	return bindings;
}

async function initializeLwkWasm(): Promise<void> {
	const imports = {
		"./lwk_wasm_bg.js": bindings as unknown as WebAssembly.ModuleImports,
	};
	const instance = await instantiateLwkWasm(imports);

	bindings.__wbg_set_wasm(instance.exports);
	startLwkWasm(instance.exports);
}

async function instantiateLwkWasm(imports: WebAssembly.Imports): Promise<WebAssembly.Instance> {
	const response = await fetch(lwkWasmUrl);

	try {
		const { instance } = await WebAssembly.instantiateStreaming(response, imports);

		return instance;
	} catch {
		const fallbackResponse = await fetch(lwkWasmUrl);
		const bytes = await fallbackResponse.arrayBuffer();
		const { instance } = await WebAssembly.instantiate(bytes, imports);

		return instance;
	}
}

function startLwkWasm(exports: WebAssembly.Exports): void {
	const start = exports.__wbindgen_start;

	if (typeof start === "function") {
		start();
	}
}
