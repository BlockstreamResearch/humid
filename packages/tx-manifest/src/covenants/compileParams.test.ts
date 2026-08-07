import { describe, expect, test } from "bun:test";

import type { ReferenceScope } from "../document/references";
import { resolveCompileParams } from "./compileParams";

// The wiring and the declared types below are the published p2pk manifest's own:
// `Pay` writes a destination with compile_params {"PUB_KEY": "params.pubkey"}, and the
// action declares `pubkey` with type "pubkey".

const PUBKEY = "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";

function scope(
	params: Record<string, unknown>,
	instance?: Record<string, unknown>,
): ReferenceScope {
	return { instance, params };
}

describe("resolveCompileParams", () => {
	test("resolves a params reference into the compiler's argument shape", () => {
		const result = resolveCompileParams(
			{ PUB_KEY: "params.pubkey" },
			{ pubkey: "pubkey" },
			scope({ pubkey: PUBKEY }),
		);

		expect(result).toEqual({
			arguments: { PUB_KEY: { type: "Pubkey", value: `0x${PUBKEY}` } },
			ok: true,
		});
	});

	test("accepts the $-prefixed spelling the corpus also uses", () => {
		const result = resolveCompileParams(
			{ PUB_KEY: "$params.pubkey" },
			{ pubkey: "pubkey" },
			scope({ pubkey: PUBKEY }),
		);

		expect(result.ok).toBe(true);
	});

	test("leaves an already-prefixed value alone", () => {
		const result = resolveCompileParams(
			{ PUB_KEY: "params.pubkey" },
			{ pubkey: "pubkey" },
			scope({ pubkey: `0x${PUBKEY}` }),
		);

		expect(result).toMatchObject({
			arguments: { PUB_KEY: { value: `0x${PUBKEY}` } },
		});
	});

	test("refuses when the referenced parameter was not supplied", () => {
		const result = resolveCompileParams(
			{ PUB_KEY: "params.pubkey" },
			{ pubkey: "pubkey" },
			scope({}),
		);

		expect(result.ok).toBe(false);
	});

	// An instance field now resolves to a value, and still cannot be encoded: nothing
	// declares its type, and the value participates in the covenant address, so encoding it
	// at a guessed width produces a well-formed address for the wrong contract.
	test("refuses an instance reference, because nothing declares its type", () => {
		const result = resolveCompileParams(
			{ PUB_KEY: "instance.OWNER" },
			{ pubkey: "pubkey" },
			scope({ pubkey: PUBKEY }, { OWNER: "0x01" }),
		);

		expect(result).toMatchObject({ ok: false });
	});

	test("refuses a declared type it does not encode", () => {
		const result = resolveCompileParams(
			{ PUB_KEY: "params.owner" },
			{ owner: "address" },
			scope({ owner: "someone" }),
		);

		expect(result).toMatchObject({ ok: false });
	});

	test("refuses a parameter with no declared type", () => {
		const result = resolveCompileParams(
			{ PUB_KEY: "params.pubkey" },
			{},
			scope({ pubkey: PUBKEY }),
		);

		expect(result).toMatchObject({ ok: false });
	});
});

// The deployed lending contracts take boolean parameters — asset_auth a burn flag,
// asset_auth_vault three of them — so a manifest wiring one has to be encodable.
describe("boolean compile parameters", () => {
	test("a true is written as the compiler reads it, not as bytes", () => {
		const result = resolveCompileParams(
			{ WITH_ASSET_BURN: "params.burn" },
			{ burn: "bool" },
			scope({ burn: "true" }),
		);

		expect(result).toEqual({
			arguments: { WITH_ASSET_BURN: { type: "bool", value: "true" } },
			ok: true,
		});
	});

	test("a false too", () => {
		const result = resolveCompileParams(
			{ WITH_ASSET_BURN: "params.burn" },
			{ burn: "bool" },
			scope({ burn: "false" }),
		);

		expect(result).toMatchObject({ arguments: { WITH_ASSET_BURN: { value: "false" } } });
	});

	test("a one and a zero are read as the booleans they spell", () => {
		expect(
			resolveCompileParams({ B: "params.burn" }, { burn: "bool" }, scope({ burn: "1" })),
		).toMatchObject({ arguments: { B: { value: "true" } } });
		expect(
			resolveCompileParams({ B: "params.burn" }, { burn: "bool" }, scope({ burn: "0" })),
		).toMatchObject({ arguments: { B: { value: "false" } } });
	});

	// Anything else goes through unchanged so the compiler names the type, rather than being
	// turned into `false` here — which would be a different covenant at a different address.
	test("anything else is left for the compiler to refuse by name", () => {
		expect(
			resolveCompileParams({ B: "params.burn" }, { burn: "bool" }, scope({ burn: "maybe" })),
		).toMatchObject({ arguments: { B: { value: "maybe" } } });
	});
});

// What a person actually does wrong: paste the address the wallet showed them into the
// field that wants a key. Without a width check the value is hex-prefixed and handed to
// the compiler, which fails inside its own parser at a character position — a true error
// about the wrong thing (DISC-134).
describe("a value that cannot be its declared type", () => {
	const wiring = { PUB_KEY: "params.pubkey" };
	const types = { pubkey: "pubkey" };

	function resolve(pubkey: string) {
		return resolveCompileParams(wiring, types, scope({ pubkey }));
	}

	test("a confidential address where a key belongs is refused, saying what was wanted", () => {
		const result = resolve(
			"tlq1qqd54s2q2d7fqv2nv8y6pnfh2w0sjr2tvu43tpsjvlm8fshffwrfy8lc2n9t96aqxtz5zv9mdhlp3hzklkfppg852dg7urtnyu",
		);

		expect(result.ok ? "" : result.reason).toContain("x-only public key");
	});

	test("and names the compile parameter and the reference, which the compiler's own error cannot", () => {
		const result = resolve("nonsense");

		expect(result.ok ? "" : result.reason).toContain("PUB_KEY");
		expect(result.ok ? "" : result.reason).toContain("params.pubkey");
	});

	test("a key of the wrong length is refused by length, not by looking wrong", () => {
		const result = resolve("79be667e");

		expect(result.ok ? "" : result.reason).toContain("8 hexadecimal characters");
	});

	test("a real x-only key passes, with or without the prefix", () => {
		const key = "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";

		expect(resolve(key).ok).toBe(true);
		expect(resolve(`0x${key}`).ok).toBe(true);
	});
});
