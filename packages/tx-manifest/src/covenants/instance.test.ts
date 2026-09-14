import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import currentVaultletJson from "../__fixtures__/current/vaultlet.manifest.json";
import mutualJson from "../__fixtures__/mutual.manifest.json";
import vaultletJson from "../__fixtures__/vaultlet.manifest.json";
import { findAction, type NormalisedAction, normaliseManifest } from "../document/normalise";
import { COVENANT_HASH_SEED, covenantHashFrom, ITERATION_BOUND } from "./covenantHash";
import { createsInstance, resolveCreatedInstance } from "./instance";

/**
 * A deployment that does not exist yet, worked out from the action that creates it.
 *
 * Everything else in this package starts from a contract that already exists: the wallet rebuilds
 * it, reads what is at its outpoint, and refuses when the two disagree. A constructor has none of
 * that. There is no deployment to read its fields from, and half of what it records is compiler
 * output — a covenant's script hash, which nothing but a wallet can produce.
 *
 * The hashes are not worked out in an order, because the document states none: one field's
 * covenant may be built from another's hash, in either direction or both. Every unknown starts at
 * a seed, all of them are recomputed together, and the round that reproduces its own input is the
 * answer.
 */

const KEY = "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
const ASSET = `a0${"00".repeat(30)}0a`;

const SOURCES = Object.fromEntries(
	["vault", "reserve", "guard", "left", "right"].map((name) => [
		`./${name}.simf`,
		readFileSync(new URL(`../__fixtures__/contracts/${name}.simf`, import.meta.url), "utf8"),
	]),
);

/**
 * A compiler substitute that is a real function of what it is handed.
 *
 * A stub returning a constant would converge in one round whatever the document said, which is
 * the one thing these tests are about. This is deterministic and depends on every argument, so a
 * chain of hashes settles exactly as deep as the document makes it and a cycle never settles at
 * all — the same behaviour a real compiler produces, without one.
 */
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

	/**
	 * The guard is built from the reserve's hash, and the reserve from nothing but the request. So
	 * one round produces a guard built on the seed, the next produces one built on the reserve's
	 * real hash, and the third reproduces its own input — which is what says it settled rather
	 * than merely stopped.
	 */
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

	/**
	 * The type beside a tapleaf's value is the only thing that says what it is. The reserve's own
	 * parameters are a key and a height, and the height is written as decimal at the width the
	 * document declared it at rather than as hexadecimal of some width nobody stated.
	 */
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

/**
 * The mode a protocol says its contracts were built in reaches the compiler that hashes them.
 *
 * A covenant hash is the hash of a scriptPubKey, and the flag changes the commitment root the
 * script is derived from — so a hash taken in the wrong mode is the hash of a contract nobody
 * deployed. It is then compiled into the covenant the action creates, which lands at an address
 * nothing can spend.
 */
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

	/**
	 * Empty, and said rather than omitted. The compiler distinguishes "no leaves" from "not told",
	 * and a covenant built the second way has a different taproot tree and therefore a different
	 * script — so the hash of it is the hash of something else.
	 */
	test("travels beside an explicitly empty leaf list", () => {
		const { calls } = open();

		expect(calls.every((call) => call.extraLeavesJson === "[]")).toBe(true);
	});
});

/**
 * A compiler is a wallet's own module across a wasm boundary, and it can fail. Every such failure
 * has to arrive as a refusal naming the field, not as an exception escaping the fixed point —
 * which a caller reads as the wallet crashing rather than as the wallet declining.
 */
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

	/**
	 * A hash is taken over the script's bytes. Hashing the text of something that is not hex would
	 * produce thirty-two plausible bytes that no contract will ever match — a wrong answer rather
	 * than an error, which is the failure this check exists to prevent.
	 */
	test("a compiler returning something that is not a script refuses rather than hashing it", () => {
		for (const answer of ["", "not hex", "5120abc"]) {
			const result = computing(() => answer);

			expect(result.ok).toBe(false);
			expect(result.ok ? "" : result.reason).toContain("not bytes");
		}
	});
});

/**
 * One computed field naming another through the deployment namespace rather than a bare name.
 *
 * The corpus writes the reading both ways, and both mean the fields of the deployment this action
 * is in the middle of writing. Resolving the explicit spelling against whatever deployment came
 * before would, for a constructor, resolve it against nothing at all — so the round would refuse
 * for want of a hash it had just worked out.
 */
/** The same pair of computed fields, with only how the second names the first varying. */
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

	/** The deprecated spelling of the same namespace is the same lookup and must settle alike. */
	test("identically under the deprecated compile_params. spelling", () => {
		expect(settle("compile_params.RESERVE_COV_HASH").result).toEqual(
			settle("instance.RESERVE_COV_HASH").result,
		);
	});

	/** And a bare name still means what it always did: the parameters first. */
	test("and identically to the bare name the same reading is also written as", () => {
		expect(settle("RESERVE_COV_HASH").result).toEqual(settle("instance.RESERVE_COV_HASH").result);
	});

	/**
	 * An earlier deployment stays underneath. A name neither round produced still resolves off the
	 * file the request supplied, so exposing the new fields adds a namespace rather than replacing
	 * one.
	 */
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

	/**
	 * Two covenants each built from the other's hash. There is no order in which the pair can be
	 * compiled and no value for the iteration to settle on, so the bound is reached.
	 *
	 * Returning the last round's values instead would be an address derived from something that
	 * never agreed with itself. The wallet would compare it against the chain and refuse anyway,
	 * having spent the work — or, for a covenant it was creating, pay to it.
	 */
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

	/**
	 * A leaf is part of the taproot tree the scriptPubKey is derived from, so a hash taken without
	 * one is the hash of a different covenant — and a hidden node has nothing to fail on later.
	 * Refused rather than ignored, which is the difference between an error and a wrong answer.
	 */
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
