import { describe, expect, test } from "bun:test";

import {
	createSmplxContractParamTypes,
	createSmplxCovenantCompiler,
	createSmplxScriptPubKeyCompiler,
} from "./compileCovenantWithSmplx";
import type { SmplxWasmModule } from "./loadSmplxWasm";
import { smplx } from "./smplxWasmForTests";

const PROBE_SOURCE = "fn main() { assert!(jet::eq_32(witness::A, witness::B)); }";
const SCRIPT = `5120${"11".repeat(32)}`;

/** Everything one covenant was constructed with, which is what the module is told. */
type Construction = [
	source: string,
	argumentsJson?: string | null,
	extraLeavesJson?: string | null,
	includeDebugSymbols?: boolean | null,
];

/**
 * A substitute that records how each covenant was constructed and how many were released.
 *
 * The real module can say neither: a handle across the wasm boundary does not report what it was
 * built from, and nothing observes a free. Both are exactly what this adapter is responsible for,
 * so they are what a substitute is here to see.
 */
function recording(answers: { address?: () => string; scriptPubKeyHex?: () => string } = {}) {
	const built: Construction[] = [];
	let freed = 0;

	return {
		built,
		module: {
			Covenant: class {
				constructor(...construction: Construction) {
					built.push(construction);
				}
				address() {
					return answers.address?.() ?? "tex1p_derived";
				}
				free() {
					freed += 1;
				}
				scriptPubKeyHex() {
					return answers.scriptPubKeyHex?.() ?? SCRIPT;
				}
			},
		} as unknown as Pick<SmplxWasmModule, "Covenant">,
		released: () => freed,
	};
}

describe("createSmplxCovenantCompiler", () => {
	/**
	 * All four build inputs reach the module, and none of them is left to its default. Passing
	 * nothing is not the same as passing "none": the module's own default is a different taproot
	 * tree and a different commitment root, so it is a different address — and one that compiles.
	 */
	test("forwards the source, the arguments, the leaves and the build mode", () => {
		const { built, module } = recording();

		createSmplxCovenantCompiler(module)({
			argumentsJson: '{"PUB_KEY":{"type":"Pubkey","value":"0x00"}}',
			extraLeavesJson: "[]",
			includeDebugSymbols: true,
			network: "liquid",
			source: PROBE_SOURCE,
		});

		expect(built).toEqual([
			[PROBE_SOURCE, '{"PUB_KEY":{"type":"Pubkey","value":"0x00"}}', "[]", true],
		]);
	});

	test("forwards the mode the review decided, not one of its own", () => {
		const { built, module } = recording();
		const compile = createSmplxCovenantCompiler(module);
		const asked = {
			argumentsJson: "{}",
			extraLeavesJson: "[]",
			network: "liquid",
			source: PROBE_SOURCE,
		};

		compile({ ...asked, includeDebugSymbols: false });
		compile({ ...asked, includeDebugSymbols: true });

		expect(built.map((construction) => construction[3])).toEqual([false, true]);
	});

	describe("what it releases", () => {
		// The covenant is a handle across the wasm boundary, so it is released here rather than
		// left to a collector that does not know it holds wasm memory.
		test("releases the covenant it compiled", () => {
			const { module, released } = recording();

			createSmplxCovenantCompiler(module)({
				argumentsJson: "{}",
				extraLeavesJson: "[]",
				includeDebugSymbols: false,
				network: "liquid",
				source: PROBE_SOURCE,
			});

			expect(released()).toBe(1);
		});

		// A compile that throws holds the same handle as one that does not, which is why this is
		// a `finally` and not a trailing call.
		test("releases the covenant when reading it throws", () => {
			const { module, released } = recording({
				address: () => {
					throw new Error("unknown network");
				},
			});

			expect(() =>
				createSmplxCovenantCompiler(module)({
					argumentsJson: "{}",
					extraLeavesJson: "[]",
					includeDebugSymbols: false,
					network: "not-a-network",
					source: PROBE_SOURCE,
				}),
			).toThrow();
			expect(released()).toBe(1);
		});
	});
});

describe("createSmplxScriptPubKeyCompiler", () => {
	/**
	 * The network is bound rather than asked for: a script's bytes do not depend on it — a network
	 * decides how those bytes are rendered as an address — so it is this wallet's own setting, and
	 * a port taking it per call would invite a caller to vary something that cannot vary.
	 */
	test("binds the network and forwards everything the document decided", () => {
		const { built, module } = recording();
		const hex = createSmplxScriptPubKeyCompiler(
			module,
			"liquid-testnet",
		)({
			argumentsJson: "{}",
			extraLeavesJson: "[]",
			includeDebugSymbols: true,
			source: PROBE_SOURCE,
		});

		expect(hex).toBe(SCRIPT);
		expect(built).toEqual([[PROBE_SOURCE, "{}", "[]", true]]);
	});

	/**
	 * Synchronous, because the review calls it inside a fixed point: a set of covenant hashes that
	 * name each other is settled by recompiling all of them together, once per round, and an
	 * asynchronous step there would make the number of rounds depend on scheduling.
	 */
	test("answers without a promise", () => {
		const { module } = recording();
		const answer = createSmplxScriptPubKeyCompiler(
			module,
			"liquid",
		)({
			argumentsJson: "{}",
			extraLeavesJson: "[]",
			includeDebugSymbols: false,
			source: PROBE_SOURCE,
		});

		expect(typeof answer).toBe("string");
	});

	test("releases the covenant, including when compiling it throws", () => {
		const { module, released } = recording({
			scriptPubKeyHex: () => {
				throw new Error("did not compile");
			},
		});

		expect(() =>
			createSmplxScriptPubKeyCompiler(
				module,
				"liquid",
			)({
				argumentsJson: "{}",
				extraLeavesJson: "[]",
				includeDebugSymbols: false,
				source: PROBE_SOURCE,
			}),
		).toThrow();
		expect(released()).toBe(1);
	});
});

/** The port, reading a fixed answer, for the cases that are about the answer's shape. */
const answering = (answer: string) =>
	createSmplxContractParamTypes({ covenantParameterTypes: () => answer });

describe("createSmplxContractParamTypes", () => {
	test("reads the types the compiler reports for a contract", () => {
		expect(answering('{"SLOT_COUNT":"u8","WITH_BURN":"bool"}')(PROBE_SOURCE)).toEqual({
			SLOT_COUNT: "u8",
			WITH_BURN: "bool",
		});
	});

	test("reads a contract that declares none as declaring none", () => {
		expect(answering("{}")(PROBE_SOURCE)).toEqual({});
	});

	test("passes the source through unchanged", () => {
		const asked: string[] = [];

		createSmplxContractParamTypes({
			covenantParameterTypes: (source: string) => {
				asked.push(source);

				return "{}";
			},
		})(PROBE_SOURCE);

		expect(asked).toEqual([PROBE_SOURCE]);
	});

	/**
	 * A malformed answer throws rather than being passed through half-read. The review catches it
	 * and reports the contract as one that did not compile, which is what it is — whereas a
	 * partially-read map would silently leave a parameter untyped, and an untyped parameter is one
	 * the wallet then declines to encode for a reason about the wrong thing.
	 */
	test("throws on an answer that is not JSON at all", () => {
		expect(() => answering("not json")(PROBE_SOURCE)).toThrow();
	});

	test("throws on an answer that is not a set of names", () => {
		for (const answer of ["[]", '"u8"', "null", "7"]) {
			expect(() => answering(answer)(PROBE_SOURCE)).toThrow();
		}
	});

	test("throws naming the parameter whose type is not a type", () => {
		expect(() => answering('{"SLOT_COUNT":8}')(PROBE_SOURCE)).toThrow(/SLOT_COUNT/);
	});
});

/**
 * The same three ports against the real wasm module.
 *
 * A substitute can agree with itself about anything; only the module can say what a source
 * actually compiles to, and that both spellings of where a covenant sits come from one compile.
 */
describe("against the module this wallet ships", () => {
	const compile = createSmplxCovenantCompiler(smplx);
	const asked = {
		argumentsJson: "{}",
		extraLeavesJson: "[]",
		includeDebugSymbols: false,
		network: "liquid-testnet",
		source: PROBE_SOURCE,
	};

	test("reports both spellings of where a covenant is, from one compile", async () => {
		const compiled = await compile(asked);

		expect(compiled.address.startsWith("tex1p")).toBe(true);
		expect(compiled.scriptPubKeyHex).toMatch(/^(?:[0-9a-f]{2})+$/);
	});

	test("agrees with what a covenant compiled on its own says", async () => {
		const compiled = await compile(asked);
		const covenant = new smplx.Covenant(PROBE_SOURCE, "{}", "[]", false);

		// A failing assertion throws, and the handle it holds is the same one a passing assertion
		// holds — so the release is a `finally` here for the reason it is one in production.
		try {
			expect(compiled.address).toBe(covenant.address("liquid-testnet"));
			expect(compiled.scriptPubKeyHex).toBe(covenant.scriptPubKeyHex("liquid-testnet"));
		} finally {
			covenant.free();
		}
	});

	/** The flag changes the commitment root, so the same source lands somewhere else entirely. */
	test("builds a different covenant in the other mode", async () => {
		const plain = await compile(asked);
		const debug = await compile({ ...asked, includeDebugSymbols: true });

		expect(debug.scriptPubKeyHex).not.toBe(plain.scriptPubKeyHex);
	});

	test("hashes the same script the full compile locks to", () => {
		// Released the way production releases one. A handle constructed inside the assertion is a
		// handle nothing frees, and it holds wasm memory a collector does not know about.
		const covenant = new smplx.Covenant(PROBE_SOURCE, "{}", "[]", false);

		try {
			expect(createSmplxScriptPubKeyCompiler(smplx, "liquid-testnet")(asked)).toBe(
				covenant.scriptPubKeyHex("liquid-testnet"),
			);
		} finally {
			covenant.free();
		}
	});

	// Awaited because the port the review declares accepts an answer either way round: this
	// adapter answers at once, and one reading a contract across a boundary that cannot would
	// answer with a promise. The caller is written for both, so the test reads it as the caller
	// does rather than as this implementation happens to.
	test("reads what the module says a contract's parameters are", async () => {
		const declared = await createSmplxContractParamTypes(smplx)(
			"fn main() { assert!(jet::eq_8(param::SLOTS, 2)); }",
		);

		expect(declared.SLOTS).toBe("u8");
	});

	test("lets a source that will not compile throw, rather than reporting an address for it", () => {
		expect(() => compile({ ...asked, source: "fn main() { this is not simplicityhl }" })).toThrow();
	});

	test("lets an unknown network throw", () => {
		expect(() => compile({ ...asked, network: "not-a-network" })).toThrow();
	});
});
