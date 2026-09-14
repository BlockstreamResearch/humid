import type { reviewManifestAction } from "@humid/tx-manifest";

import type { SmplxWasmModule } from "./loadSmplxWasm";

/**
 * The three ports the review asks a wallet for, read off the function that asks.
 *
 * Derived rather than imported by name because the package does not publish them: they are part
 * of what `reviewManifestAction` takes, and taking them from there is what keeps this adapter and
 * the thing it is passed to from drifting apart under a second spelling.
 */
type ReviewInput = Parameters<typeof reviewManifestAction>[1];
type CompileCovenant = ReviewInput["compile"];
type ContractParamTypesOf = NonNullable<ReviewInput["contractParamTypes"]>;
type CompileScriptPubKey = ReviewInput["scriptPubKeyOf"];

/**
 * The wallet's own compiler, as the review package's port asks for it.
 *
 * One compiled covenant, two spellings of where it is. Deriving them from separate compiles is
 * how an output comes to be paid to a bech32 string: the transaction builder hex-decodes every
 * output script it is given, and an address is not hex. Two compiles can also drift apart in a
 * way nothing would catch, since nothing compares them.
 *
 * **All four build inputs are forwarded, and none of them is optional.** The module takes the
 * leaves and the build mode as nullable arguments, and passing nothing is not the same as passing
 * "none" — it is the module's own default, which is a different taproot tree and a different
 * commitment root, and therefore a different address that compiles perfectly well. The review has
 * already decided both; this passes on what it decided.
 *
 * The covenant handle lives across the wasm boundary, so it is released here rather than left to
 * a collector that does not know it holds wasm memory. A `finally` and not a trailing call,
 * because a compile that throws holds the same handle as one that does not.
 */
export function createSmplxCovenantCompiler(
	smplx: Pick<SmplxWasmModule, "Covenant">,
): CompileCovenant {
	return ({ argumentsJson, extraLeavesJson, includeDebugSymbols, network, source }) => {
		const covenant = new smplx.Covenant(
			source,
			argumentsJson,
			extraLeavesJson,
			includeDebugSymbols,
		);

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

/**
 * The same compiler again, for the covenant hashes a document works out for itself.
 *
 * Separate from the compiler above because a hash needs no address, and because the review calls
 * it synchronously inside a fixed point: a set of covenant hashes that name each other is settled
 * by recompiling all of them together, once per round, and an asynchronous step in that loop
 * would make the number of rounds depend on scheduling rather than on the document.
 *
 * **The network is bound here rather than asked for.** A script's bytes do not depend on it — a
 * network decides how those bytes are rendered as an address — so it is this wallet's own
 * setting, and a port that took it per call would be inviting a caller to vary something that
 * cannot vary. The build mode is forwarded rather than bound, because it belongs to the document
 * being reviewed and the review is what read it.
 */
export function createSmplxScriptPubKeyCompiler(
	smplx: Pick<SmplxWasmModule, "Covenant">,
	network: string,
): CompileScriptPubKey {
	return ({ argumentsJson, extraLeavesJson, includeDebugSymbols, source }) => {
		const covenant = new smplx.Covenant(
			source,
			argumentsJson,
			extraLeavesJson,
			includeDebugSymbols,
		);

		try {
			return covenant.scriptPubKeyHex(network);
		} finally {
			covenant.free();
		}
	};
}

/**
 * What a contract declares the types of its own compile parameters to be.
 *
 * SimplicityHL has no syntax for declaring one: `param::NAME` is written where a value is wanted
 * and the type checker gives it the type that position demands. So a parameter's type is not in
 * the source text at all — it is the result of analysing the source, and the compiler is the only
 * thing that can state it. The review needs the answer before it can build any arguments, which
 * is why this is a port of its own rather than something read off a compiled covenant.
 *
 * The module answers with JSON, and what comes back is checked rather than trusted into the
 * package's own shape. A malformed answer is thrown rather than passed through half-read: the
 * review catches it and reports the contract as one that did not compile, which is what it is —
 * whereas a partially-read map would silently leave a parameter untyped, and an untyped parameter
 * is one this wallet then declines to encode for a reason about the wrong thing.
 */
export function createSmplxContractParamTypes(
	smplx: Pick<SmplxWasmModule, "covenantParameterTypes">,
): ContractParamTypesOf {
	return (source) => {
		const answered: unknown = JSON.parse(smplx.covenantParameterTypes(source));

		if (typeof answered !== "object" || answered === null || Array.isArray(answered)) {
			throw new TypeError(
				"the compiler did not report this contract's parameter types as a set of names.",
			);
		}

		const declared: Record<string, string> = {};

		for (const [name, type] of Object.entries(answered)) {
			if (typeof type !== "string") {
				throw new TypeError(
					`the compiler reported the type of ${name} as ${JSON.stringify(type)}, which does ` +
						"not name a type.",
				);
			}

			declared[name] = type;
		}

		return declared;
	};
}
