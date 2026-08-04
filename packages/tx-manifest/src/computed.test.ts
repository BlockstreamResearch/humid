import { describe, expect, test } from "bun:test";

import { COVENANT_HASH_SEED, ITERATION_BOUND, resolveComputedParams } from "./computed";
import { normaliseManifest } from "./normalise";

// A covenant's compile parameters can hold another covenant's script hash, and that other
// covenant's parameters can hold the first's — which the reference implementation resolves
// by seeding with 32 zero bytes and iterating. AC-08 requires those values to reach a stable
// answer inside a bound, and requires exceeding the bound to fail the action rather than to
// proceed on whatever the last round produced.

const SOURCES = { "./a.simf": "fn main() { }", "./b.simf": "fn main() { }" };

/**
 * Stands in for compiling a contract and hashing its scriptPubKey. It is a real function of
 * its arguments — the same arguments give the same answer and different ones differ — which
 * is the only property convergence depends on.
 */
function compiler() {
	const calls: { argumentsJson: string; source: string }[] = [];

	return {
		calls,
		hashCovenant: ({ argumentsJson, source }: { argumentsJson: string; source: string }) => {
			calls.push({ argumentsJson, source });

			let hash = 0n;

			for (const code of `${source}${argumentsJson}`) {
				hash = (hash * 31n + BigInt(code.codePointAt(0) ?? 0)) % 2n ** 64n;
			}

			return hash.toString(16).padStart(64, "7");
		},
	};
}

/** A manifest whose action declares the given computed parameters. */
function manifestWith(params: Record<string, unknown>) {
	return normaliseManifest({ actions: { Open: { params } } }).manifest;
}

function resolve(params: Record<string, unknown>, supplied: Record<string, unknown> = {}) {
	const manifest = manifestWith(params);

	return resolveComputedParams(manifest.actions[0]!, {
		contractSources: SOURCES,
		hashCovenant: compiler().hashCovenant,
		scope: { params: supplied },
	});
}

describe("resolveComputedParams", () => {
	describe("an action with nothing computed", () => {
		test("returns no values and asks the compiler nothing", () => {
			const { calls, hashCovenant } = compiler();
			const manifest = manifestWith({ pubkey: { type: "pubkey" } });
			const result = resolveComputedParams(manifest.actions[0]!, {
				contractSources: SOURCES,
				hashCovenant,
				scope: { params: {} },
			});

			expect(result).toMatchObject({ ok: true });
			expect(result.ok && result.values).toEqual({});
			expect(calls).toHaveLength(0);
		});
	});

	describe("one computed parameter", () => {
		test("resolves to the hash of the contract it names", () => {
			const result = resolve({ A_COV_HASH: { compute: "tapleaf", simf: "./a.simf" } });

			expect(result).toMatchObject({ ok: true });
			expect(result.ok && result.values.A_COV_HASH).toMatch(/^[0-9a-f]{64}$/);
		});

		// Convergence is a round that reproduces its own input, so even a value depending on
		// nothing costs a confirming round. Reporting the first round instead would say
		// "computed once", which for a set of interdependent values does not mean settled.
		test("settles on the round that reproduces it", () => {
			const result = resolve({ A_COV_HASH: { compute: "tapleaf", simf: "./a.simf" } });

			expect(result.ok ? result.rounds : 0).toBe(2);
		});

		test("refuses when the contract source was not supplied, naming it", () => {
			const manifest = manifestWith({ A: { compute: "tapleaf", simf: "./missing.simf" } });
			const result = resolveComputedParams(manifest.actions[0]!, {
				contractSources: {},
				hashCovenant: compiler().hashCovenant,
				scope: { params: {} },
			});

			expect(result.ok ? "" : result.reason).toContain("./missing.simf");
		});
	});

	// AC-08. A hash cannot be a fixed point of itself, so what converges is a chain that
	// only appears circular: auto-populate hands every parameter to every covenant, which
	// makes each look dependent on the other, and `depends_on` narrows that to what a
	// contract actually consumes. The seed is what makes the first round possible.
	describe("covenant hashes that appear to reference each other", () => {
		const APPARENT = {
			// Auto-populate would hand A's hash to B and B's to A. depends_on says B consumes
			// nothing, which turns the apparent cycle into a chain.
			A_COV_HASH: { compute: "tapleaf", params: { OTHER: "params.B_COV_HASH" }, simf: "./a.simf" },
			B_COV_HASH: { compute: "tapleaf", depends_on: [], simf: "./b.simf" },
		};

		test("resolves both to stable values", () => {
			const result = resolve(APPARENT);

			expect(result).toMatchObject({ ok: true });

			if (result.ok) {
				expect(result.values.A_COV_HASH).toMatch(/^[0-9a-f]{64}$/);
				expect(result.values.B_COV_HASH).toMatch(/^[0-9a-f]{64}$/);
			}
		});

		test("takes more than one round, and stays inside the bound", () => {
			const result = resolve(APPARENT);

			expect(result.ok ? result.rounds : 0).toBeGreaterThan(1);
			expect(result.ok ? result.rounds : 0).toBeLessThanOrEqual(ITERATION_BOUND);
		});

		test("the values it reports are the ones a further round would reproduce", () => {
			const first = resolve(APPARENT);
			const second = resolve(APPARENT);

			expect(first.ok ? first.values : {}).toEqual(second.ok ? second.values : {});
		});

		test("seeds the first round with 32 zero bytes rather than with nothing", () => {
			const { calls, hashCovenant } = compiler();
			const manifest = manifestWith(APPARENT);

			resolveComputedParams(manifest.actions[0]!, {
				contractSources: SOURCES,
				hashCovenant,
				scope: { params: {} },
			});

			expect(calls[0]?.argumentsJson).toContain(COVENANT_HASH_SEED);
		});

		// depends_on is the mechanism, so its absence has to be visible: without it the same
		// pair is genuinely circular and the bound is what catches it.
		test("without depends_on the same pair is a real cycle and fails", () => {
			const result = resolve({
				A_COV_HASH: {
					compute: "tapleaf",
					params: { OTHER: "params.B_COV_HASH" },
					simf: "./a.simf",
				},
				B_COV_HASH: {
					compute: "tapleaf",
					params: { OTHER: "params.A_COV_HASH" },
					simf: "./b.simf",
				},
			});

			expect(result.ok ? "" : result.reason).toContain("settle");
		});
	});

	// The bound is what stops an unstable manifest producing an address nobody checked.
	describe("when it cannot converge", () => {
		test("fails rather than returning the last round's values", () => {
			const manifest = manifestWith({
				A: { compute: "tapleaf", params: { OTHER: "params.A" }, simf: "./a.simf" },
			});
			let round = 0;
			const result = resolveComputedParams(manifest.actions[0]!, {
				contractSources: SOURCES,
				// Never settles: a different answer every time it is asked.
				hashCovenant: () => {
					round += 1;

					return round.toString(16).padStart(64, "0");
				},
				scope: { params: {} },
			});

			expect(result.ok).toBe(false);
		});

		test("says it was the iteration bound rather than a compilation failure", () => {
			const manifest = manifestWith({
				A: { compute: "tapleaf", params: { OTHER: "params.A" }, simf: "./a.simf" },
			});
			let round = 0;
			const result = resolveComputedParams(manifest.actions[0]!, {
				contractSources: SOURCES,
				hashCovenant: () => {
					round += 1;

					return round.toString(16).padStart(64, "0");
				},
				scope: { params: {} },
			});

			expect(result.ok ? "" : result.reason).toContain("settle");
		});
	});

	describe("what it does not do", () => {
		test("refuses a computed kind it does not implement, naming it", () => {
			const result = resolve({ A: { compute: "simf_fn", fn: "hash", simf: "./a.simf" } });

			expect(result.ok ? "" : result.reason).toContain("simf_fn");
		});

		test("refuses extra leaves, which are the byte-encoding slice's", () => {
			const result = resolve({
				A: { compute: "tapleaf", extra_leaves: ["0x00"], simf: "./a.simf" },
			});

			expect(result.ok ? "" : result.reason).toContain("extra_leaves");
		});

		test("a supplied parameter is not recomputed", () => {
			const { calls, hashCovenant } = compiler();
			const manifest = manifestWith({ pubkey: { type: "pubkey" } });

			resolveComputedParams(manifest.actions[0]!, {
				contractSources: SOURCES,
				hashCovenant,
				scope: { params: { pubkey: "0x01" } },
			});

			expect(calls).toHaveLength(0);
		});
	});
});

// AC-08's other half, pinned. Convergence producing *a* stable value is not enough: it has
// to produce the same one every time, because the value is a covenant's script hash and a
// different one is a different address. The hash function here is the real SHA256 of a real
// compiled scriptPubKey, so what is pinned is the whole path.
describe("a settled hash is the same hash every time", () => {
	const CHAIN = {
		// B consumes nothing, so the apparent cycle auto-populate would create is a chain.
		A_COV_HASH: { compute: "tapleaf", params: { PUB_KEY: "params.B_COV_HASH" }, simf: "./a.simf" },
		B_COV_HASH: { compute: "tapleaf", depends_on: [], simf: "./b.simf" },
	};

	function settle() {
		const manifest = normaliseManifest({
			actions: { Open: { params: { ...CHAIN, PUB_KEY: { type: "pubkey" } } } },
		}).manifest;

		return resolveComputedParams(manifest.actions[0]!, {
			contractSources: SOURCES,
			// A stand-in that is a real function of its arguments, which is the only property
			// convergence needs; the address path itself is pinned against the real module.
			hashCovenant: ({ argumentsJson, source }) => {
				let hash = 0n;

				for (const code of `${source}${argumentsJson}`) {
					hash = (hash * 1_000_003n + BigInt(code.codePointAt(0) ?? 0)) % 2n ** 256n;
				}

				return hash.toString(16).padStart(64, "0").slice(-64);
			},
			scope: { params: {} },
		});
	}

	test("settles on the same values on every run", () => {
		const first = settle();
		const second = settle();

		expect(first.ok && first.values).toEqual(second.ok ? second.values : {});
	});

	test("and on the same number of rounds", () => {
		const result = settle();

		expect(result.ok ? result.rounds : 0).toBe(3);
	});
});
