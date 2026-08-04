import { describe, expect, test } from "bun:test";

import p2pkManifest from "./__fixtures__/p2pk.manifest.json";
import { covenantMatchesChain, deriveCovenantAddress } from "./covenant";
import { normaliseManifest } from "./normalise";

const PUBKEY = "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
const SOURCE_PATH = "./p2pk.simf";
const SOURCE =
	"fn main() { jet::bip_0340_verify((param::PUB_KEY, jet::sig_all_hash()), witness::SIGNATURE) }";

// The published manifest's own wiring for the p2pk output.
const WIRING = { PUB_KEY: "params.pubkey" };
const DECLARED_TYPES = { pubkey: "pubkey" };

const MANIFEST = normaliseManifest(p2pkManifest as unknown as Record<string, unknown>).manifest;

/** What a covenant derivation needs beyond the manifest, with the published wiring. */
function request(overrides: Record<string, unknown> = {}) {
	return {
		contractSources: { [SOURCE_PATH]: SOURCE },
		declaredTypes: DECLARED_TYPES,
		includeDebugSymbols: false,
		network: "liquid",
		scope: { params: { pubkey: PUBKEY } },
		utxoType: "p2pk_output",
		wiring: WIRING,
		...overrides,
	};
}

/** Stands in for the wasm module, recording what it was asked to compile. */
const SCRIPT = `5120${"11".repeat(32)}`;

function compiler(address = "tex1p_derived") {
	const calls: {
		argumentsJson: string;
		extraLeavesJson: string;
		network: string;
		source: string;
	}[] = [];

	return {
		calls,
		compile: (input: {
			argumentsJson: string;
			extraLeavesJson: string;
			includeDebugSymbols: boolean;
			network: string;
			source: string;
		}) => {
			calls.push(input);

			// Both spellings from one compile: the address a person is shown, and the script
			// an output pays to. Only the second is hex, and confusing them is how a bech32
			// string reached the transaction builder.
			return { address, scriptPubKeyHex: SCRIPT };
		},
	};
}

describe("deriveCovenantAddress", () => {
	test("compiles the source the request supplied, with the parameters the manifest wires", async () => {
		const { calls, compile } = compiler();

		const result = await deriveCovenantAddress(MANIFEST, { ...request(), compile });

		expect(result).toMatchObject({ derivation: { utxoType: "p2pk_output" }, ok: true });
		expect(calls).toHaveLength(1);
		expect(calls[0]?.source).toBe(SOURCE);
		expect(JSON.parse(calls[0]?.argumentsJson ?? "{}")).toEqual({
			PUB_KEY: { type: "Pubkey", value: `0x${PUBKEY}` },
		});
	});

	test("refuses a utxo type the manifest does not declare", async () => {
		const result = await deriveCovenantAddress(MANIFEST, {
			...request({ utxoType: "vault" }),
			compile: compiler().compile,
		});

		expect(result).toMatchObject({ ok: false });
	});

	test("refuses when the contract source was not supplied", async () => {
		const result = await deriveCovenantAddress(MANIFEST, {
			...request({ contractSources: {} }),
			compile: compiler().compile,
		});

		expect(result).toMatchObject({ ok: false });
	});

	test("refuses when the source does not compile, rather than throwing", async () => {
		const result = await deriveCovenantAddress(MANIFEST, {
			...request(),
			compile: () => {
				throw new Error("parse error");
			},
		});

		expect(result).toMatchObject({ ok: false });
	});
});

describe("covenantMatchesChain", () => {
	const derivation = {
		address: "tex1p_derived",
		argumentsJson: "{}",
		extraLeavesJson: "[]",
		scriptPubKeyHex: SCRIPT,
		source: SOURCE,
		utxoType: "p2pk_output",
	};

	test("matches when the rebuilt contract lands where the funds are", () => {
		expect(covenantMatchesChain(derivation, "tex1p_derived")).toEqual({ matched: true });
	});

	test("refuses when it does not, naming both addresses", () => {
		const result = covenantMatchesChain(derivation, "tex1p_somewhere_else");

		expect(result.matched).toBe(false);

		if (!result.matched) {
			expect(result.reason).toContain("tex1p_derived");
			expect(result.reason).toContain("tex1p_somewhere_else");
		}
	});
});

// Extra taproot leaves are part of the covenant address, so they are encoded from the utxo
// type's own declaration and handed to the compiler with everything else. A leaf that cannot
// be encoded refuses the derivation rather than producing an address without it.
describe("deriveCovenantAddress with extra leaves", () => {
	function manifestWithLeaves(extraLeaves: unknown[], stateVars?: Record<string, unknown>) {
		return normaliseManifest({
			utxo_types: {
				p2pk_output: {
					...(stateVars ? { state_vars: stateVars } : {}),
					script: { extra_leaves: extraLeaves, source: SOURCE_PATH, type: "simplicity" },
				},
			},
		}).manifest;
	}

	function derive(extraLeaves: unknown[], stateVars?: Record<string, unknown>) {
		const { calls, compile } = compiler();

		return deriveCovenantAddress(manifestWithLeaves(extraLeaves, stateVars), {
			...request(),
			compile,
		}).then((result) => ({ calls, result }));
	}

	test("encodes each declared leaf and hands them over in order", async () => {
		const { calls, result } = await derive([{ type: "u8", value: 1 }, "0xdeadbeef"]);

		expect(result).toMatchObject({ ok: true });
		expect(JSON.parse(calls[0]?.extraLeavesJson ?? "[]")).toEqual(["01", "deadbeef"]);
	});

	test("a utxo type with no extra leaves hands over an empty list", async () => {
		const { calls } = await derive([]);

		expect(calls[0]?.extraLeavesJson).toBe("[]");
	});

	test("resolves a state variable to its default", async () => {
		const { calls } = await derive([{ state_var: "counter" }], { counter: { default_value: 3 } });

		expect(JSON.parse(calls[0]?.extraLeavesJson ?? "[]")).toEqual(["03"]);
	});

	test("refuses the whole derivation when a leaf cannot be encoded", async () => {
		const { calls, result } = await derive([{ type: "u128", value: 1 }]);

		expect(result).toMatchObject({ ok: false });
		expect(calls).toHaveLength(0);
	});
});
