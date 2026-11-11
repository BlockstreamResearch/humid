import { describe, expect, test } from "bun:test";

import {
	createSmplxProgramParamTypes,
	createSmplxProgramCompiler,
	createSmplxScriptPubKeyCompiler,
} from "./compileProgramWithSmplx";
import type { SmplxWasmModule } from "./loadSmplxWasm";
import { smplx } from "./smplxWasmForTests";

const PROBE_SOURCE = "fn main() { assert!(jet::eq_32(witness::A, witness::B)); }";
const SCRIPT = `5120${"11".repeat(32)}`;
const CMR = "cc".repeat(32);
const TAPLEAF_HASH = "1e".repeat(32);

type Construction = [
	source: string,
	argumentsJson?: string | null,
	extraLeavesJson?: string | null,
	includeDebugSymbols?: boolean | null,
];

function recording(
	answers: {
		address?: () => string;
		cmr?: () => string;
		scriptPubKeyHex?: () => string;
		tapleafHash?: () => string;
	} = {},
) {
	const built: Construction[] = [];
	let freed = 0;

	return {
		built,
		module: {
			Program: class {
				constructor(...construction: Construction) {
					built.push(construction);
				}
				trAddress() {
					return answers.address?.() ?? "tex1p_derived";
				}
				cmr() {
					return answers.cmr?.() ?? CMR;
				}
				free() {
					freed += 1;
				}
				tapleafHash() {
					return answers.tapleafHash?.() ?? TAPLEAF_HASH;
				}
				scriptPubkey() {
					return answers.scriptPubKeyHex?.() ?? SCRIPT;
				}
			},
		} as unknown as Pick<SmplxWasmModule, "Program">,
		released: () => freed,
	};
}

describe("what a compiled program is reported as", () => {
	async function compiled() {
		const { module } = recording();

		return await createSmplxProgramCompiler(module)({
			argumentsJson: "{}",
			extraLeavesJson: "[]",
			includeDebugSymbols: false,
			network: "liquidtestnet",
			source: PROBE_SOURCE,
		});
	}

	test("carries what the contract is, not only where its funds sit", async () => {
		expect(await compiled()).toEqual({
			address: "tex1p_derived",
			cmr: CMR,
			scriptPubKeyHex: SCRIPT,
			tapleafHash: TAPLEAF_HASH,
		});
	});

	test("and reports them apart, because they answer different questions", async () => {
		const answered = await compiled();

		expect(answered.cmr).not.toBe(answered.tapleafHash);
		expect(answered.cmr).not.toBe(answered.scriptPubKeyHex);
	});
});

describe("createSmplxProgramCompiler", () => {
	test("forwards the source, the arguments, the leaves and the build mode", () => {
		const { built, module } = recording();

		createSmplxProgramCompiler(module)({
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
		const compile = createSmplxProgramCompiler(module);
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
		test("releases the program it compiled", () => {
			const { module, released } = recording();

			createSmplxProgramCompiler(module)({
				argumentsJson: "{}",
				extraLeavesJson: "[]",
				includeDebugSymbols: false,
				network: "liquid",
				source: PROBE_SOURCE,
			});

			expect(released()).toBe(1);
		});

		test("releases the program when reading it throws", () => {
			const { module, released } = recording({
				address: () => {
					throw new Error("unknown network");
				},
			});

			expect(() =>
				createSmplxProgramCompiler(module)({
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

	test("releases the program, including when compiling it throws", () => {
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

const answering = (answer: string) =>
	createSmplxProgramParamTypes({ programArgumentTypes: () => answer });

describe("createSmplxProgramParamTypes", () => {
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

		createSmplxProgramParamTypes({
			programArgumentTypes: (source: string) => {
				asked.push(source);

				return "{}";
			},
		})(PROBE_SOURCE);

		expect(asked).toEqual([PROBE_SOURCE]);
	});

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

describe("against the module this wallet ships", () => {
	const compile = createSmplxProgramCompiler(smplx);
	const asked = {
		argumentsJson: "{}",
		extraLeavesJson: "[]",
		includeDebugSymbols: false,
		network: "liquid-testnet",
		source: PROBE_SOURCE,
	};

	test("reports both spellings of where a program is, from one compile", async () => {
		const compiled = await compile(asked);

		expect(compiled.address.startsWith("tex1p")).toBe(true);
		expect(compiled.scriptPubKeyHex).toMatch(/^(?:[0-9a-f]{2})+$/);
	});

	test("agrees with what a program compiled on its own says", async () => {
		const compiled = await compile(asked);
		const program = new smplx.Program(PROBE_SOURCE, "{}", "[]", false);

		try {
			expect(compiled.address).toBe(program.trAddress("liquid-testnet"));
			expect(compiled.scriptPubKeyHex).toBe(program.scriptPubkey("liquid-testnet"));
		} finally {
			program.free();
		}
	});

	test("builds a different program in the other mode", async () => {
		const plain = await compile(asked);
		const debug = await compile({ ...asked, includeDebugSymbols: true });

		expect(debug.scriptPubKeyHex).not.toBe(plain.scriptPubKeyHex);
	});

	test("hashes the same script the full compile locks to", () => {
		const program = new smplx.Program(PROBE_SOURCE, "{}", "[]", false);

		try {
			expect(createSmplxScriptPubKeyCompiler(smplx, "liquid-testnet")(asked)).toBe(
				program.scriptPubkey("liquid-testnet"),
			);
		} finally {
			program.free();
		}
	});

	test("reads what the module says a contract's parameters are", async () => {
		const declared = await createSmplxProgramParamTypes(smplx)(
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
