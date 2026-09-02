/// <reference types="vite/client" />

/* eslint-disable no-underscore-dangle */

interface ImportMetaEnv {
	readonly VITE_WALLETCONNECT_PROJECT_ID?: string;
	readonly VITE_WALLETCONNECT_RELAY_URL?: string;
}

declare module "lwk_wasm/lwk_wasm_bg.js" {
	export * from "lwk_wasm";
	export function __wbg_set_wasm(exports: WebAssembly.Exports): void;
}

declare module "smplx-wasm/smplx_wasm_bg.js" {
	export * from "smplx-wasm";
	export function __wbg_set_wasm(exports: WebAssembly.Exports): void;
}
