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

/**
 * A covenant's parameters come off the deployment it belongs to, and the corpus wires them by
 * bare name: `{"ASSET_B": "ASSET_B"}` on a swap's offer covenant, `{"ISSUING_UTXOS_COUNT":
 * "ISSUING_UTXOS_COUNT"}` on a lending protocol's factory. Neither names a parameter of the
 * action being run — a constructor supplied those once, and every action afterwards reads them
 * back off the deployment it created.
 */
describe("a parameter the deployment holds rather than the request", () => {
	test("resolves off the deployment when the request has no such name", () => {
		const result = resolveCompileParams(
			{ PUB_KEY: "OWNER" },
			{ OWNER: "pubkey" },
			scope({}, { OWNER: PUBKEY }),
		);

		expect(result).toEqual({
			arguments: { PUB_KEY: { type: "Pubkey", value: `0x${PUBKEY}` } },
			ok: true,
		});
	});

	// A value the request chose is not the deployment's to overwrite, which is the order every
	// other reader of a bare name uses.
	test("but the request wins where both hold the name", () => {
		const other = "c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5";
		const result = resolveCompileParams(
			{ PUB_KEY: "OWNER" },
			{ OWNER: "pubkey" },
			scope({ OWNER: PUBKEY }, { OWNER: other }),
		);

		expect(result).toMatchObject({ arguments: { PUB_KEY: { value: `0x${PUBKEY}` } } });
	});

	// Reaching the deployment is not permission to encode what is found there. The value still
	// has to have been declared with a type, or the address would be built on a guessed width.
	test("and is still refused when nothing declares its type", () => {
		const result = resolveCompileParams({ PUB_KEY: "OWNER" }, {}, scope({}, { OWNER: PUBKEY }));

		expect(result).toMatchObject({ ok: false });
	});

	test("a name neither holds is refused naming the name, as it always was", () => {
		const result = resolveCompileParams({ PUB_KEY: "OWNER" }, { OWNER: "pubkey" }, scope({}, {}));

		expect(result.ok ? "" : result.reason).toContain("OWNER");
	});
});

/**
 * The types that arrived with this slice, at the site that uses them. What each one encodes to
 * is proved in `paramEncoding.test.ts`; what is here is that the wiring reaches them.
 */
describe("the types a live deployment declares", () => {
	const ASSET = "6f0279e9ed041c3d710a9f57d0c02928416460c4b722ae3457a11eec8ef5b4d5";

	test("an asset id, an amount, a height and a count", () => {
		const result = resolveCompileParams(
			{
				ASSET_B: "ASSET_B",
				ISSUING_UTXOS_COUNT: "params.count",
				MAX_FEE: "MAX_FEE",
				TIMEOUT: "TIMEOUT",
			},
			{ ASSET_B: "liquid.asset_id", MAX_FEE: "u64", TIMEOUT: "u32", count: "u8" },
			scope({ count: "2" }, { ASSET_B: ASSET, MAX_FEE: "5000", TIMEOUT: "900000" }),
		);

		expect(result).toMatchObject({
			arguments: {
				ASSET_B: { type: "u256" },
				ISSUING_UTXOS_COUNT: { type: "u8", value: "2" },
				MAX_FEE: { type: "u64", value: "5000" },
				TIMEOUT: { type: "u32", value: "900000" },
			},
			ok: true,
		});
	});

	test("and an address, which is refused by name because nothing says what it encodes to", () => {
		const result = resolveCompileParams(
			{ PAYEE: "PAYEE" },
			{ PAYEE: "address" },
			scope({}, { PAYEE: "ex1pg45gz7zucl2krj42qk0q9udzsgcxd0vxqs3ej6l286fvvgdmqe9s5w0cfg" }),
		);

		expect(result.ok).toBe(false);
		expect(result.ok ? "" : result.reason).toContain("address");
		expect(result.ok ? "" : result.reason).toContain("rendering of a locking script");
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

	// Anything else is refused rather than turned into `false`, which would be a different
	// covenant at a different address. It used to be handed to the compiler, which refused it
	// too — at a character position, in a message naming neither the compile parameter nor the
	// reference. Refusing it here says all four things the person filling the request can act
	// on, the same way a key of the wrong width already did.
	test("anything else is refused, naming what was wired and what was wanted", () => {
		const result = resolveCompileParams(
			{ B: "params.burn" },
			{ burn: "bool" },
			scope({ burn: "maybe" }),
		);

		expect(result.ok).toBe(false);
		expect(result.ok ? "" : result.reason).toContain("B is wired to params.burn");
		expect(result.ok ? "" : result.reason).toContain("true or false");
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

/**
 * The wiring some deployments write: a bare value where every other parameter has a name.
 *
 * A value declares nothing at that position, so the only thing that can type it is the contract
 * it is being compiled into. These prove the two are joined, and that a name still wins wherever
 * one resolves.
 */
describe("a compile parameter written as a value rather than a reference", () => {
	const CONTRACT = {
		declares: { ASSET_AMOUNT: "u64", ASSET_ID: "u256", WITH_ASSET_BURN: "bool" },
		source: "./asset_auth.simf",
	};

	test("is encoded from the type its contract declares for it", () => {
		const result = resolveCompileParams(
			{ ASSET_AMOUNT: "1", WITH_ASSET_BURN: "false" },
			{},
			scope({}),
			undefined,
			CONTRACT,
		);

		expect(result).toEqual({
			arguments: {
				ASSET_AMOUNT: { type: "u64", value: "1" },
				WITH_ASSET_BURN: { type: "bool", value: "false" },
			},
			ok: true,
		});
	});

	/**
	 * The order that keeps every document already working. A name means a deployment field
	 * wherever one exists, so a field really called `false` is still read as the field.
	 */
	test("but a name that resolves is still read as the name", () => {
		const result = resolveCompileParams(
			{ ASSET_AMOUNT: "COUNT" },
			{ COUNT: "u64" },
			scope({}, { COUNT: "7" }),
			undefined,
			CONTRACT,
		);

		expect(result).toMatchObject({ arguments: { ASSET_AMOUNT: { value: "7" } } });
	});

	test("and a name resolving to nothing is reported as the lookup it was, not as a value", () => {
		const result = resolveCompileParams(
			{ ASSET_AMOUNT: "MISSING" },
			{},
			scope({}),
			undefined,
			CONTRACT,
		);

		expect(result.ok).toBe(false);
		expect(result.ok ? "" : result.reason).toContain("neither a parameter nor an argument");
	});

	// Without the contract there is no type, and a value's own shape is never one. This is the
	// state every caller was in before, and it still refuses rather than reading `1` as a number.
	test("and refuses entirely when no contract says what the parameter is", () => {
		const result = resolveCompileParams({ ASSET_AMOUNT: "1" }, {}, scope({}));

		expect(result.ok).toBe(false);
		expect(result.ok ? "" : result.reason).toContain("ASSET_AMOUNT");
	});

	test("and refuses a thirty-two byte value, whose byte order its width does not decide", () => {
		const result = resolveCompileParams(
			{ ASSET_ID: `0x${"ab".repeat(32)}` },
			{},
			scope({}),
			undefined,
			CONTRACT,
		);

		expect(result.ok).toBe(false);
		expect(result.ok ? "" : result.reason).toContain("byte order");
	});
});
