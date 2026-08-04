import { describe, expect, test } from "bun:test";

import p2pkManifest from "./__fixtures__/p2pk.manifest.json";
import { covenantMatchesChain, deriveCovenantAddress } from "./covenant";
import type { ParsedLiquidProcessCtParams } from "./types";

const PUBKEY = "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
const SOURCE_PATH = "./p2pk.simf";
const SOURCE =
	"fn main() { jet::bip_0340_verify((param::PUB_KEY, jet::sig_all_hash()), witness::SIGNATURE) }";

// The published manifest's own wiring for the p2pk output.
const WIRING = { PUB_KEY: "params.pubkey" };
const DECLARED_TYPES = { pubkey: "pubkey" };

function request(
	overrides: Partial<ParsedLiquidProcessCtParams> = {},
): ParsedLiquidProcessCtParams {
	return {
		action: "Receive",
		broadcast: false,
		contractSources: { [SOURCE_PATH]: SOURCE },
		manifest: p2pkManifest as unknown as Record<string, unknown>,
		params: { pubkey: PUBKEY },
		...overrides,
	};
}

/** Stands in for the wasm module, recording what it was asked to compile. */
function compiler(address = "tex1p_derived") {
	const calls: { argumentsJson: string; network: string; source: string }[] = [];

	return {
		calls,
		compile: (input: { argumentsJson: string; network: string; source: string }) => {
			calls.push(input);

			return address;
		},
	};
}

describe("deriveCovenantAddress", () => {
	test("compiles the source the request supplied, with the parameters the manifest wires", async () => {
		const { calls, compile } = compiler();

		const result = await deriveCovenantAddress(request(), {
			compile,
			declaredTypes: DECLARED_TYPES,
			network: "liquid",
			utxoType: "p2pk_output",
			wiring: WIRING,
		});

		expect(result).toMatchObject({ derivation: { utxoType: "p2pk_output" }, ok: true });
		expect(calls).toHaveLength(1);
		expect(calls[0]?.source).toBe(SOURCE);
		expect(JSON.parse(calls[0]?.argumentsJson ?? "{}")).toEqual({
			PUB_KEY: { type: "Pubkey", value: `0x${PUBKEY}` },
		});
	});

	test("refuses a utxo type the manifest does not declare", async () => {
		const result = await deriveCovenantAddress(request(), {
			compile: compiler().compile,
			declaredTypes: DECLARED_TYPES,
			network: "liquid",
			utxoType: "vault",
			wiring: WIRING,
		});

		expect(result).toMatchObject({ ok: false });
	});

	test("refuses when the contract source was not supplied", async () => {
		const result = await deriveCovenantAddress(request({ contractSources: {} }), {
			compile: compiler().compile,
			declaredTypes: DECLARED_TYPES,
			network: "liquid",
			utxoType: "p2pk_output",
			wiring: WIRING,
		});

		expect(result).toMatchObject({ ok: false });
	});

	test("refuses when the source does not compile, rather than throwing", async () => {
		const result = await deriveCovenantAddress(request(), {
			compile: () => {
				throw new Error("parse error");
			},
			declaredTypes: DECLARED_TYPES,
			network: "liquid",
			utxoType: "p2pk_output",
			wiring: WIRING,
		});

		expect(result).toMatchObject({ ok: false });
	});
});

describe("covenantMatchesChain", () => {
	const derivation = { address: "tex1p_derived", utxoType: "p2pk_output" };

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
