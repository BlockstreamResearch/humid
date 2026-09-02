import { describe, expect, test } from "bun:test";

import { createSmplxCovenantCompiler } from "./compileCovenantWithSmplx";
import type { SmplxWasmModule } from "./loadSmplxWasm";
import { smplx } from "./smplxWasmForTests";

const PROBE_SOURCE = "fn main() { assert!(jet::eq_32(witness::A, witness::B)); }";

/** A substitute that counts what it was asked to release, since the real one cannot say. */
function counting(): { module: Pick<SmplxWasmModule, "Covenant">; released: () => number } {
	let freed = 0;

	return {
		module: {
			Covenant: class {
				address() {
					return "tex1p_derived";
				}
				free() {
					freed += 1;
				}
				scriptPubKeyHex() {
					return `5120${"11".repeat(32)}`;
				}
			},
		} as unknown as Pick<SmplxWasmModule, "Covenant">,
		released: () => freed,
	};
}

describe("createSmplxCovenantCompiler", () => {
	// The real module, because the point of this adapter is that both spellings come from one
	// compile. A substitute could return any pair and agree with itself.
	const compile = createSmplxCovenantCompiler(smplx);

	test("reports both spellings of where a covenant is, from one compile", async () => {
		const compiled = await compile({
			argumentsJson: "{}",
			network: "liquid-testnet",
			source: PROBE_SOURCE,
		});

		expect(compiled.address.startsWith("tex1p")).toBe(true);
		expect(compiled.scriptPubKeyHex).toMatch(/^(?:[0-9a-f]{2})+$/);
	});

	test("agrees with what a covenant compiled on its own says", async () => {
		const compiled = await compile({
			argumentsJson: "{}",
			network: "liquid-testnet",
			source: PROBE_SOURCE,
		});
		const covenant = new smplx.Covenant(PROBE_SOURCE, "{}");

		expect(compiled.address).toBe(covenant.address("liquid-testnet"));
		expect(compiled.scriptPubKeyHex).toBe(covenant.scriptPubKeyHex("liquid-testnet"));
		covenant.free();
	});

	test("lets a source that will not compile throw, rather than reporting an address for it", () => {
		expect(() =>
			compile({
				argumentsJson: "{}",
				network: "liquid-testnet",
				source: "fn main() { this is not simplicityhl }",
			}),
		).toThrow();
	});

	test("lets an unknown network throw", () => {
		expect(() =>
			compile({ argumentsJson: "{}", network: "not-a-network", source: PROBE_SOURCE }),
		).toThrow();
	});

	describe("what it releases", () => {
		// The covenant is a handle across the wasm boundary, so it is released here rather than
		// left to a collector that does not know it holds wasm memory.
		test("releases the covenant it compiled", () => {
			const { module, released } = counting();

			createSmplxCovenantCompiler(module)({
				argumentsJson: "{}",
				network: "liquid",
				source: PROBE_SOURCE,
			});

			expect(released()).toBe(1);
		});

		// A compile that throws holds the same handle as one that does not, which is why this is
		// a `finally` and not a trailing call.
		test("releases the covenant when reading it throws", () => {
			let freed = 0;
			const module = {
				Covenant: class {
					address(): string {
						throw new Error("unknown network");
					}
					free() {
						freed += 1;
					}
					scriptPubKeyHex() {
						return "";
					}
				},
			} as unknown as Pick<SmplxWasmModule, "Covenant">;

			expect(() =>
				createSmplxCovenantCompiler(module)({
					argumentsJson: "{}",
					network: "not-a-network",
					source: PROBE_SOURCE,
				}),
			).toThrow();
			expect(freed).toBe(1);
		});
	});
});
