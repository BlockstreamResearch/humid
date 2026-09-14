import type { reviewManifestAction } from "@humid/tx-manifest";

import type { SmplxWasmModule } from "./loadSmplxWasm";

/**
 * The compiler the review asks a wallet for, read off the function that asks.
 *
 * Derived rather than imported by name because the package does not publish one: the port is
 * part of what `reviewManifestAction` takes, and taking it from there is what keeps this
 * adapter and the thing it is passed to from drifting apart under a second spelling.
 */
type CompileCovenant = Parameters<typeof reviewManifestAction>[1]["compile"];

/**
 * The wallet's own compiler, as the review package's port asks for it.
 *
 * One compiled covenant, two spellings of where it is. Deriving them from separate compiles
 * is how an output comes to be paid to a bech32 string: the transaction builder hex-decodes
 * every output script it is given, and an address is not hex. Two compiles can also drift
 * apart in a way nothing would catch, since nothing compares them.
 *
 * The covenant handle lives across the wasm boundary, so it is released here rather than
 * left to a collector that does not know it holds wasm memory. A `finally` and not a
 * trailing call, because a compile that throws holds the same handle as one that does not.
 */
export function createSmplxCovenantCompiler(
	smplx: Pick<SmplxWasmModule, "Covenant">,
): CompileCovenant {
	return ({ argumentsJson, network, source }) => {
		const covenant = new smplx.Covenant(source, argumentsJson);

		try {
			return {
				address: covenant.address(network),
				scriptPubKeyHex: covenant.scriptPubKeyHex(network),
			};
		} finally {
			covenant.free();
		}
	};
}
