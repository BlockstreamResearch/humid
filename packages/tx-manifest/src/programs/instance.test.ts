import { describe, expect, test } from "bun:test";

import { type Action, Manifest } from "../document/manifest";
import { Fixture, refusalOf } from "../review/reviewForTests";
import { createsInstance, resolveCreatedInstance } from "./instance";
import { PROGRAM_HASH_SEED, programHashFrom, ITERATION_BOUND } from "./programHash";

const KEY = "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
const ASSET = `a0${"00".repeat(30)}0a`;

const VAULTLET = Fixture.load("vaultlet");
const MUTUAL = Fixture.load("mutual");
const SOURCES = { ...VAULTLET.contractSources, ...MUTUAL.contractSources };

function recordingCompiler(debugSymbols = false) {
	const calls: {
		argumentsJson: string;
		extraLeavesJson: string;
		includeDebugSymbols: boolean;
		source: string;
	}[] = [];

	return {
		calls,
		hashProgram: programHashFrom(
			({ argumentsJson, extraLeavesJson, includeDebugSymbols, source }) => {
				calls.push({ argumentsJson, extraLeavesJson, includeDebugSymbols, source });

				return `5120${Bun.hash(JSON.stringify([source, argumentsJson, includeDebugSymbols]))
					.toString(16)
					.padStart(64, "0")}`;
			},
			debugSymbols,
		),
	};
}

const vaultlet = new Manifest(VAULTLET.manifest);
const mutual = new Manifest(MUTUAL.manifest);

function actionNamed(manifest: typeof vaultlet, name: string): Action {
	const found = manifest.action(name);

	if (!found) {
		throw new Error(`This fixture declares no action named ${name}.`);
	}

	return found;
}

const OPEN_VAULT = actionNamed(vaultlet, "OpenVault");
const PARAMS = {
	OWNER_PUB_KEY: KEY,
	TIMEOUT: "900000",
	VAULT_AMOUNT: "50000",
	VAULT_ASSET_ID: ASSET,
};

function open(params: Record<string, unknown> = PARAMS) {
	const { calls, hashProgram } = recordingCompiler();

	return {
		calls,
		result: resolveCreatedInstance(OPEN_VAULT, {
			contractSources: SOURCES,
			hashProgram,
			scope: { params },
		}),
	};
}

describe("a chain of fields that each read the one before", () => {
	const LINKS = 5;

	function chained(): Action {
		const fields: Record<string, unknown> = { OWNER_PUB_KEY: "params.OWNER_PUB_KEY" };

		for (let index = LINKS - 1; index >= 0; index -= 1) {
			fields[`LINK_${index}`] = {
				params: {
					RESERVE_COV_HASH: {
						type: index === 0 ? "pubkey" : "bytes32",
						value: index === 0 ? "OWNER_PUB_KEY" : `LINK_${index - 1}`,
					},
				},
				simf: "./guard.simf",
				type: "tapleaf",
			};
		}

		return {
			isConstructor: true,
			name: "Chain",
			node: { create_instance: { fields } },
		};
	}

	function settleChain() {
		const { calls, hashProgram } = recordingCompiler();

		return {
			calls,
			result: resolveCreatedInstance(chained(), {
				contractSources: SOURCES,
				hashProgram,
				scope: { params: PARAMS },
			}),
		};
	}

	test("settles however long the chain is, in the two rounds a single field takes", () => {
		expect(settleChain().result.rounds).toBe(2);
	});

	test("and compiles each link once per round rather than once per link per round", () => {
		const { calls } = settleChain();

		expect(calls).toHaveLength(LINKS * 2);
	});

	test("with every link settled to a hash of its own", () => {
		const { result } = settleChain();

		const hashes = Array.from({ length: LINKS }, (_, index) => result.fields[`LINK_${index}`]);

		expect(new Set(hashes).size).toBe(LINKS);
		expect(hashes.every((hash) => hash?.length === 64)).toBe(true);
		expect(hashes.some((hash) => hash === PROGRAM_HASH_SEED)).toBe(false);
	});
});

function leafyWith(
	extraLeaves: unknown[],
	hashProgram: ReturnType<typeof recordingCompiler>["hashProgram"],
) {
	return resolveCreatedInstance(
		{
			isConstructor: true,
			name: "Leafy",
			node: {
				create_instance: {
					fields: {
						X: { type: "tapleaf", extra_leaves: extraLeaves, simf: "./reserve.simf" },
					},
				},
			},
		},
		{ contractSources: SOURCES, hashProgram, scope: { params: { TIMEOUT: "900000" } } },
	);
}

function leafy(extraLeaves: unknown[]) {
	return leafyWith(extraLeaves, recordingCompiler().hashProgram);
}

describe("which actions create a deployment", () => {
	test("the one carrying the block does, and the one that only spends does not", () => {
		expect(createsInstance(OPEN_VAULT)).toBe(true);
		expect(createsInstance(actionNamed(vaultlet, "Withdraw"))).toBe(false);
	});
});

describe("the deployment a constructor creates", () => {
	test("records the values the request supplied, under the names the document gives them", () => {
		const { result } = open();

		expect(result.fields).toMatchObject({
			OWNER_PUB_KEY: KEY,
			TIMEOUT: "900000",
			VAULT_ASSET_ID: ASSET,
		});
	});

	test("and records a whole number the request supplied as one, in its digits", () => {
		expect(open({ ...PARAMS, TIMEOUT: 900_000 }).result.fields.TIMEOUT).toBe("900000");
	});

	test("and the program hashes nothing but a compiler could produce", () => {
		const { result } = open();

		expect(result.fields.RESERVE_COV_HASH).toHaveLength(64);
		expect(result.fields.GUARD_COV_HASH).toHaveLength(64);
	});

	test("settles a hash that depends on another hash in the fewest rounds there are", () => {
		expect(open().result.rounds).toBe(2);
	});

	test("compiles the guard against the reserve's settled hash, not against the seed", () => {
		const { calls, result } = open();

		const guard = calls.findLast((call) => call.source === SOURCES["./guard.simf"]);

		expect(JSON.parse(guard?.argumentsJson ?? "{}")).toEqual({
			RESERVE_COV_HASH: { type: "u256", value: `0x${result.fields.RESERVE_COV_HASH}` },
		});
	});

	test("builds each program at the types the document declares beside the values", () => {
		const { calls } = open();
		const reserve = calls.find((call) => call.source === SOURCES["./reserve.simf"]);

		expect(JSON.parse(reserve?.argumentsJson ?? "{}")).toEqual({
			OWNER_PUB_KEY: { type: "Pubkey", value: `0x${KEY}` },
			TIMEOUT: { type: "u32", value: "900000" },
		});
	});
});

describe("the mode the document states its contracts were built in", () => {
	test("is passed to the compiler that takes each hash", () => {
		const { calls, hashProgram } = recordingCompiler(true);
		resolveCreatedInstance(OPEN_VAULT, {
			contractSources: SOURCES,
			hashProgram,
			scope: { params: PARAMS },
		});

		expect(calls.length).toBeGreaterThan(0);
		expect(calls.every((call) => call.includeDebugSymbols)).toBe(true);
	});

	test("and changes the hashes the deployment records", () => {
		const plain = open().result;
		const { hashProgram } = recordingCompiler(true);
		const debug = resolveCreatedInstance(OPEN_VAULT, {
			contractSources: SOURCES,
			hashProgram,
			scope: { params: PARAMS },
		});

		expect(debug.fields.RESERVE_COV_HASH).not.toBe(plain.fields.RESERVE_COV_HASH);
	});

	test("travels beside an explicitly empty leaf list", () => {
		const { calls } = open();

		expect(calls.every((call) => call.extraLeavesJson === "[]")).toBe(true);
	});
});

describe("when the compiler cannot produce a hash", () => {
	function computing(compile: () => string) {
		return resolveCreatedInstance(OPEN_VAULT, {
			contractSources: SOURCES,
			hashProgram: programHashFrom(compile, false),
			scope: { params: PARAMS },
		});
	}

	test("a compiler that throws refuses, naming the field and carrying the reason", () => {
		const result = refusalOf(() =>
			computing(() => {
				throw new Error("wasm module not loaded");
			}),
		);

		expect(result.reason).toContain("RESERVE_COV_HASH");
		expect(result.reason).toContain("wasm module not loaded");
	});

	test("a compiler returning something that is not a script refuses rather than hashing the result", () => {
		for (const answer of ["", "not hex", "5120abc"]) {
			const result = refusalOf(() => computing(() => answer));

			expect(result.reason).toContain("not bytes");
		}
	});
});

const dependant = (spelling: string): Action => ({
	isConstructor: true,
	name: "Open",
	node: {
		create_instance: {
			fields: {
				RESERVE_COV_HASH: {
					params: {
						OWNER_PUB_KEY: { type: "pubkey", value: "OWNER_PUB_KEY" },
						TIMEOUT: { type: "u32", value: "TIMEOUT" },
					},
					simf: "./reserve.simf",
					type: "tapleaf",
				},
				GUARD_COV_HASH: {
					params: { RESERVE_COV_HASH: { type: "bytes32", value: spelling } },
					simf: "./guard.simf",
					type: "tapleaf",
				},
			},
		},
	},
});

describe("a program hash that names another through the deployment", () => {
	function settle(spelling: string) {
		const { calls, hashProgram } = recordingCompiler();

		return {
			calls,
			result: resolveCreatedInstance(dependant(spelling), {
				contractSources: SOURCES,
				hashProgram,
				scope: { params: PARAMS },
			}),
		};
	}

	test("settles through an explicit instance reference, in the same fewest rounds", () => {
		expect(settle("instance.RESERVE_COV_HASH").result.rounds).toBe(2);
	});

	test("and compiles the dependant against the settled hash, not the seed", () => {
		const { calls, result } = settle("instance.RESERVE_COV_HASH");

		const guard = calls.findLast((call) => call.source === SOURCES["./guard.simf"]);

		expect(JSON.parse(guard?.argumentsJson ?? "{}")).toEqual({
			RESERVE_COV_HASH: { type: "u256", value: `0x${result.fields.RESERVE_COV_HASH}` },
		});
		expect(result.fields.RESERVE_COV_HASH).not.toBe(PROGRAM_HASH_SEED);
	});

	test("and identically to the bare name the same reading is also written as", () => {
		expect(settle("RESERVE_COV_HASH").result).toEqual(settle("instance.RESERVE_COV_HASH").result);
	});

	test("without hiding the deployment the request supplied", () => {
		const { hashProgram } = recordingCompiler();
		const result = resolveCreatedInstance(
			{
				isConstructor: true,
				name: "Open",
				node: {
					create_instance: {
						fields: {
							GUARD_COV_HASH: {
								params: { RESERVE_COV_HASH: { type: "bytes32", value: "instance.OLD_HASH" } },
								simf: "./guard.simf",
								type: "tapleaf",
							},
						},
					},
				},
			},
			{
				contractSources: SOURCES,
				hashProgram,
				scope: { instance: { OLD_HASH: "ab".repeat(32) }, params: {} },
			},
		);

		expect(result.rounds).toBe(2);
	});
});

describe("what it refuses rather than recording a value nobody chose", () => {
	test("a field naming something the request did not supply", () => {
		expect(refusalOf(() => open({ OWNER_PUB_KEY: KEY, TIMEOUT: "900000" })).reason).toContain(
			"VAULT_ASSET_ID",
		);
	});

	test("a contract whose source was not supplied", () => {
		const { hashProgram } = recordingCompiler();
		const result = refusalOf(() =>
			resolveCreatedInstance(OPEN_VAULT, {
				contractSources: { "./reserve.simf": SOURCES["./reserve.simf"] ?? "" },
				hashProgram,
				scope: { params: PARAMS },
			}),
		);

		expect(result.reason).toContain("./guard.simf");
	});

	test("a pair of hashes that never settle, saying which fields and after how many rounds", () => {
		const { hashProgram } = recordingCompiler();
		const result = refusalOf(() =>
			resolveCreatedInstance(actionNamed(mutual, "Knot"), {
				contractSources: SOURCES,
				hashProgram,
				scope: { params: {} },
			}),
		);

		const reason = result.reason;

		expect(reason).toContain("LEFT_COV_HASH, RIGHT_COV_HASH");
		expect(reason).toContain(`${ITERATION_BOUND} rounds`);
	});

	test("a field computed by something this runtime does not implement", () => {
		const { hashProgram } = recordingCompiler();
		const result = refusalOf(() =>
			resolveCreatedInstance(
				{
					isConstructor: true,
					name: "Odd",
					node: { create_instance: { fields: { X: { simf: "./a.simf", type: "simf_fn" } } } },
				},
				{ contractSources: SOURCES, hashProgram, scope: { params: {} } },
			),
		);

		expect(result.reason).toContain('"simf_fn"');
	});

	test("a bare word, which names neither a parameter nor a field, rather than recording the word", () => {
		const { hashProgram } = recordingCompiler();
		const created = (value: string) =>
			resolveCreatedInstance(
				{ isConstructor: true, name: "Words", node: { create_instance: { fields: { X: value } } } },
				{ contractSources: SOURCES, hashProgram, scope: { params: { OWNER: KEY } } },
			);

		expect(refusalOf(() => created("OWNER")).reason).toContain("params.OWNER");
		expect(created("2").fields.X).toBe("2");
	});

	test("a state leaf that is not the width a contract reads one at", () => {
		const result = refusalOf(() => leafy([{ payload: ["0x00"], type: "tapdata" }]));

		expect(result.reason).toContain("a leaf is 32");
	});

	test("a state leaf of some other kind than the one state is carried in", () => {
		const result = refusalOf(() =>
			leafy([{ payload: [`0x${"00".repeat(32)}`], type: "tapscript" }]),
		);

		expect(result.reason).toContain("tapdata");
	});

	test("a multi-byte value that does not say which end its bytes run from", () => {
		const result = refusalOf(() =>
			leafy([
				{ payload: [{ pad_to: 32, align: "right", type: "u64", value: "7" }], type: "tapdata" },
			]),
		);

		expect(result.reason).toContain("which end");
	});

	test("a value padded out without saying which end of the padding it sits at", () => {
		const result = refusalOf(() =>
			leafy([
				{ payload: [{ endian: "be", pad_to: 32, type: "u64", value: "7" }], type: "tapdata" },
			]),
		);

		expect(result.reason).toContain("which end");
	});
});

describe("the state a contract's address commits to", () => {
	function hashOf(extraLeaves: unknown[]) {
		const { calls, hashProgram } = recordingCompiler();
		const result = leafyWith(extraLeaves, hashProgram);

		return { calls, result };
	}

	test("is encoded and handed to the compiler, rather than refused", () => {
		const { calls, result } = hashOf([
			{ payload: [`0x${"00".repeat(31)}01`], type: "tapdata" },
			{
				payload: [{ align: "right", endian: "be", pad_to: 32, type: "u64", value: "1000" }],
				type: "tapdata",
			},
		]);

		expect(result.rounds).toBe(2);
		expect(JSON.parse(calls[0]?.extraLeavesJson ?? "[]")).toEqual([
			`${"00".repeat(31)}01`,
			`${"00".repeat(24)}00000000000003e8`,
		]);
	});

	test("reads a value through the scope the rest of the deployment is read through", () => {
		const { calls } = hashOf([
			{
				payload: [{ align: "right", endian: "be", pad_to: 32, type: "u64", value: "TIMEOUT" }],
				type: "tapdata",
			},
		]);

		expect(JSON.parse(calls[0]?.extraLeavesJson ?? "[]")).toEqual([
			`${"00".repeat(24)}00000000000dbba0`,
		]);
	});

	test("and takes the other end of a number when the document asks", () => {
		const { calls } = hashOf([
			{
				payload: [{ align: "right", endian: "le", pad_to: 32, type: "u64", value: "1000" }],
				type: "tapdata",
			},
		]);

		expect(JSON.parse(calls[0]?.extraLeavesJson ?? "[]")).toEqual([
			`${"00".repeat(24)}e803000000000000`,
		]);
	});

	test("a contract with no state hands the compiler no leaves", () => {
		const { calls } = hashOf([]);

		expect(calls[0]?.extraLeavesJson).toBe("[]");
	});
});
