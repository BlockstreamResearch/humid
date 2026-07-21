// liquidjs-lib (the coin-control PSET builder in `lib/pset.ts`) is a CommonJS bundle that relies on
// Node's `Buffer` global, which browsers don't provide. Expose it before any module that needs it is
// evaluated — this file must be the very first import in `main.tsx`.
import { Buffer } from "buffer";

if (typeof globalThis.Buffer === "undefined") {
	globalThis.Buffer = Buffer;
}
