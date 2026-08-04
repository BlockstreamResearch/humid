import { describe, expect, test } from "bun:test";

import { resolveCompileParams } from "./compileParams";
import type { ParsedLiquidProcessCtParams } from "./types";

// The wiring and the declared types below are the published p2pk manifest's own:
// `Pay` writes a destination with compile_params {"PUB_KEY": "params.pubkey"}, and the
// action declares `pubkey` with type "pubkey".

const PUBKEY = "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";

function request(params: Record<string, unknown>): ParsedLiquidProcessCtParams {
	return {
		action: "Pay",
		broadcast: false,
		contractSources: {},
		manifest: {},
		params,
	};
}

describe("resolveCompileParams", () => {
	test("resolves a params reference into the compiler's argument shape", () => {
		const result = resolveCompileParams(
			request({ pubkey: PUBKEY }),
			{ PUB_KEY: "params.pubkey" },
			{ pubkey: "pubkey" },
		);

		expect(result).toEqual({
			arguments: { PUB_KEY: { type: "Pubkey", value: `0x${PUBKEY}` } },
			ok: true,
		});
	});

	test("accepts the $-prefixed spelling the corpus also uses", () => {
		const result = resolveCompileParams(
			request({ pubkey: PUBKEY }),
			{ PUB_KEY: "$params.pubkey" },
			{ pubkey: "pubkey" },
		);

		expect(result.ok).toBe(true);
	});

	test("leaves an already-prefixed value alone", () => {
		const result = resolveCompileParams(
			request({ pubkey: `0x${PUBKEY}` }),
			{ PUB_KEY: "params.pubkey" },
			{ pubkey: "pubkey" },
		);

		expect(result).toMatchObject({
			arguments: { PUB_KEY: { value: `0x${PUBKEY}` } },
		});
	});

	test("refuses when the referenced parameter was not supplied", () => {
		const result = resolveCompileParams(
			request({}),
			{ PUB_KEY: "params.pubkey" },
			{ pubkey: "pubkey" },
		);

		expect(result.ok).toBe(false);
	});

	// A reference this runtime cannot resolve must refuse rather than resolve to something
	// plausible: the value participates in the covenant address, so a wrong one produces a
	// well-formed address for the wrong contract.
	test("refuses an instance reference rather than guessing", () => {
		const result = resolveCompileParams(
			request({ pubkey: PUBKEY }),
			{ PUB_KEY: "instance.OWNER" },
			{ pubkey: "pubkey" },
		);

		expect(result).toMatchObject({ ok: false });
	});

	test("refuses a declared type it does not encode", () => {
		const result = resolveCompileParams(
			request({ owner: "someone" }),
			{ PUB_KEY: "params.owner" },
			{ owner: "address" },
		);

		expect(result).toMatchObject({ ok: false });
	});

	test("refuses a parameter with no declared type", () => {
		const result = resolveCompileParams(
			request({ pubkey: PUBKEY }),
			{ PUB_KEY: "params.pubkey" },
			{},
		);

		expect(result).toMatchObject({ ok: false });
	});
});
