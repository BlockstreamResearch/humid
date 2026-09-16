import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import currentVaultletJson from "../__fixtures__/current/vaultlet.manifest.json";
import mutualJson from "../__fixtures__/mutual.manifest.json";
import vaultletJson from "../__fixtures__/vaultlet.manifest.json";
import { findAction, type NormalisedAction, normaliseManifest } from "../document/normalise";
import { COVENANT_HASH_SEED, covenantHashFrom, ITERATION_BOUND } from "./covenantHash";
import { createsInstance, resolveCreatedInstance } from "./instance";

const KEY = "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
const ASSET = `a0${"00".repeat(30)}0a`;

const SOURCES = Object.fromEntries(
	["vault", "reserve", "guard", "left", "right"].map((name) => [
		`./${name}.simf`,
		readFileSync(new URL(`../__fixtures__/contracts/${name}.simf`, import.meta.url), "utf8"),
	]),
);

function recordingCompiler(debugSymbols = false) {
	const calls: {
		argumentsJson: string;
		extraLeavesJson: string;
		includeDebugSymbols: boolean;
		source: string;
	}[] = [];

	return {
		calls,
		hashCovenant: covenantHashFrom(
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

const vaultlet = normaliseManifest(vaultletJson as unknown as Record<string, unknown>).manifest;
const mutual = normaliseManifest(mutualJson as unknown as Record<string, unknown>).manifest;

function actionNamed(manifest: typeof vaultlet, name: string): NormalisedAction {
	const found = findAction(manifest, name);

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
	const { calls, hashCovenant } = recordingCompiler();

	return {
		calls,
		result: resolveCreatedInstance(OPEN_VAULT, {
			contractSources: SOURCES,
			hashCovenant,
			scope: { params },
		}),
	};
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

		expect(result.ok).toBe(true);

		if (result.ok) {
			expect(result.instance.fields.OWNER_PUB_KEY).toBe(KEY);
			expect(result.instance.fields.VAULT_ASSET_ID).toBe(ASSET);
			expect(result.instance.fields.TIMEOUT).toBe("900000");
		}
	});

	test("and the covenant hashes nothing but a compiler could produce", () => {
		const { result } = open();

		expect(result.ok ? result.instance.fields.RESERVE_COV_HASH : "").toHaveLength(64);
		expect(result.ok ? result.instance.fields.GUARD_COV_HASH : "").toHaveLength(64);
	});

	test("settles a hash that depends on another hash, and says in how many rounds", () => {
		const { result } = open();

		expect(result.ok ? result.instance.rounds : 0).toBe(3);
	});

	test("compiles the guard against the reserve's settled hash, not against the seed", () => {
		const { calls, result } = open();

		if (!result.ok) {
			throw new Error(result.reason);
		}

		const guard = calls.findLast((call) => call.source === SOURCES["./guard.simf"]);

		expect(JSON.parse(guard?.argumentsJson ?? "{}")).toEqual({
			RESERVE_COV_HASH: { type: "u256", value: `0x${result.instance.fields.RESERVE_COV_HASH}` },
		});
	});

	test("builds each covenant at the types the document declares beside the values", () => {
		const { calls, result } = open();

		expect(result.ok).toBe(true);

		const reserve = calls.find((call) => call.source === SOURCES["./reserve.simf"]);

		expect(JSON.parse(reserve?.argumentsJson ?? "{}")).toEqual({
			OWNER_PUB_KEY: { type: "Pubkey", value: `0x${KEY}` },
			TIMEOUT: { type: "u32", value: "900000" },
		});
	});

	test("is the same deployment whichever generation of the document declared it", () => {
		const current = normaliseManifest(
			currentVaultletJson as unknown as Record<string, unknown>,
		).manifest;
		const { hashCovenant } = recordingCompiler();
		const asked = {
			contractSources: SOURCES,
			hashCovenant,
			scope: { params: PARAMS },
		};

		expect(resolveCreatedInstance(actionNamed(current, "OpenVault"), asked)).toEqual(
			resolveCreatedInstance(OPEN_VAULT, asked),
		);
	});
});

describe("the mode the document states its contracts were built in", () => {
	test("is passed to the compiler that takes each hash", () => {
		const { calls, hashCovenant } = recordingCompiler(true);
		const result = resolveCreatedInstance(OPEN_VAULT, {
			contractSources: SOURCES,
			hashCovenant,
			scope: { params: PARAMS },
		});

		expect(result.ok).toBe(true);
		expect(calls.length).toBeGreaterThan(0);
		expect(calls.every((call) => call.includeDebugSymbols)).toBe(true);
	});

	test("and changes the hashes the deployment records", () => {
		const plain = open().result;
		const { hashCovenant } = recordingCompiler(true);
		const debug = resolveCreatedInstance(OPEN_VAULT, {
			contractSources: SOURCES,
			hashCovenant,
			scope: { params: PARAMS },
		});

		expect(plain.ok && debug.ok).toBe(true);

		if (!plain.ok || !debug.ok) {
			return;
		}

		expect(debug.instance.fields.RESERVE_COV_HASH).not.toBe(plain.instance.fields.RESERVE_COV_HASH);
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
			hashCovenant: covenantHashFrom(compile, false),
			scope: { params: PARAMS },
		});
	}

	test("a compiler that throws refuses, naming the field and carrying the reason", () => {
		const result = computing(() => {
			throw new Error("wasm module not loaded");
		});

		expect(result.ok).toBe(false);
		expect(result.ok ? "" : result.reason).toContain("RESERVE_COV_HASH");
		expect(result.ok ? "" : result.reason).toContain("wasm module not loaded");
	});

	test("a compiler returning something that is not a script refuses rather than hashing it", () => {
		for (const answer of ["", "not hex", "5120abc"]) {
			const result = computing(() => answer);

			expect(result.ok).toBe(false);
			expect(result.ok ? "" : result.reason).toContain("not bytes");
		}
	});
});

const dependant = (spelling: string): NormalisedAction => ({
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

describe("a covenant hash that names another through the deployment", () => {
	function settle(spelling: string) {
		const { calls, hashCovenant } = recordingCompiler();

		return {
			calls,
			result: resolveCreatedInstance(dependant(spelling), {
				contractSources: SOURCES,
				hashCovenant,
				scope: { params: PARAMS },
			}),
		};
	}

	test("settles through an explicit instance reference", () => {
		const { result } = settle("instance.RESERVE_COV_HASH");

		expect(result.ok).toBe(true);
		expect(result.ok ? result.instance.rounds : 0).toBe(3);
	});

	test("and compiles the dependant against the settled hash, not the seed", () => {
		const { calls, result } = settle("instance.RESERVE_COV_HASH");

		if (!result.ok) {
			throw new Error(result.reason);
		}

		const guard = calls.findLast((call) => call.source === SOURCES["./guard.simf"]);

		expect(JSON.parse(guard?.argumentsJson ?? "{}")).toEqual({
			RESERVE_COV_HASH: { type: "u256", value: `0x${result.instance.fields.RESERVE_COV_HASH}` },
		});
		expect(result.instance.fields.RESERVE_COV_HASH).not.toBe(COVENANT_HASH_SEED);
	});

	test("and identically to the bare name the same reading is also written as", () => {
		expect(settle("RESERVE_COV_HASH").result).toEqual(settle("instance.RESERVE_COV_HASH").result);
	});

	test("without hiding the deployment the request supplied", () => {
		const { hashCovenant } = recordingCompiler();
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
				hashCovenant,
				scope: { instance: { OLD_HASH: "ab".repeat(32) }, params: {} },
			},
		);

		expect(result.ok).toBe(true);
		expect(result.ok ? result.instance.rounds : 0).toBe(2);
	});
});

describe("what it refuses rather than recording a value nobody chose", () => {
	test("a field naming something the request did not supply", () => {
		const { result } = open({ OWNER_PUB_KEY: KEY, TIMEOUT: "900000" });

		expect(result.ok).toBe(false);
		expect(result.ok ? "" : result.reason).toContain("VAULT_ASSET_ID");
	});

	test("a contract whose source was not supplied", () => {
		const { hashCovenant } = recordingCompiler();
		const result = resolveCreatedInstance(OPEN_VAULT, {
			contractSources: { "./reserve.simf": SOURCES["./reserve.simf"] ?? "" },
			hashCovenant,
			scope: { params: PARAMS },
		});

		expect(result.ok).toBe(false);
		expect(result.ok ? "" : result.reason).toContain("./guard.simf");
	});

	test("a pair of hashes that never settle, saying which fields and after how many rounds", () => {
		const { hashCovenant } = recordingCompiler();
		const result = resolveCreatedInstance(actionNamed(mutual, "Knot"), {
			contractSources: SOURCES,
			hashCovenant,
			scope: { params: {} },
		});

		expect(result.ok).toBe(false);

		const reason = result.ok ? "" : result.reason;

		expect(reason).toContain("LEFT_COV_HASH, RIGHT_COV_HASH");
		expect(reason).toContain(`${ITERATION_BOUND} rounds`);
	});

	test("a field computed by something this runtime does not implement", () => {
		const { hashCovenant } = recordingCompiler();
		const result = resolveCreatedInstance(
			{
				isConstructor: true,
				name: "Odd",
				node: { create_instance: { fields: { X: { compute: "contract", simf: "./a.simf" } } } },
			},
			{ contractSources: SOURCES, hashCovenant, scope: { params: {} } },
		);

		expect(result.ok).toBe(false);
		expect(result.ok ? "" : result.reason).toContain("contract");
	});

	test("a tapleaf carrying extra leaves this runtime cannot encode", () => {
		const { hashCovenant } = recordingCompiler();
		const result = resolveCreatedInstance(
			{
				isConstructor: true,
				name: "Leafy",
				node: {
					create_instance: {
						fields: {
							X: {
								compute: "tapleaf",
								extra_leaves: [{ payload: ["0x00"], type: "tapdata" }],
								simf: "./reserve.simf",
							},
						},
					},
				},
			},
			{ contractSources: SOURCES, hashCovenant, scope: { params: {} } },
		);

		expect(result.ok).toBe(false);
		expect(result.ok ? "" : result.reason).toContain("extra_leaves");
	});
});
