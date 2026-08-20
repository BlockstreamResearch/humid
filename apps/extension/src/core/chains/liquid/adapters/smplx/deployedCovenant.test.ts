import { beforeAll, describe, expect, test } from "bun:test";

import { contractSource, smplx } from "./smplxWasmForTests";

/**
 * The other end of the covenant-parameter chain: what the real compiler makes of the arguments
 * this wallet emits.
 *
 * `tx-manifest` proves that reading a live protocol's published document produces exactly the
 * argument string below — it holds no compiler, by design, because a wallet supplies one. This
 * proves that string is the one that reproduces the covenant the protocol is actually deployed
 * at. The string is the join, written out character for character at both ends, so an encoding
 * that changed at either would break one of these two files.
 *
 * The script is not this module's own output pinned against itself. `lending_v3.manifest.json`
 * records it as the deployed factory's fixed scriptPubKey — its address depends only on the two
 * integers below, not on the asset it holds, which is why one published constant covers every
 * deployment of it.
 */

/** What `tx-manifest` asks for, from the published document. Kept identical to its own copy. */
const ARGUMENTS =
	'{"ISSUING_UTXOS_COUNT":{"type":"u8","value":"2"},"REISSUANCE_FLAGS":{"type":"u64","value":"0"}}';

/** What the published document says the deployed factory is locked by. */
const DEPLOYED_SCRIPT_PUB_KEY =
	"5120456881785cc7d561caaa059e02f1a2823066bd860423996bea3e92c621bb064b";

/** The document says its contracts were built with debug symbols, and that changes the address. */
const DEBUG_SYMBOLS = true;

let source = "";

beforeAll(async () => {
	source = await contractSource("issuance_factory.simf");
});

function scriptPubKeyFor(argumentsJson: string, includeDebugSymbols = DEBUG_SYMBOLS): string {
	const contract = new smplx.Contract(source, argumentsJson, "[]", includeDebugSymbols);

	try {
		return contract.scriptPubKeyHex("liquid");
	} finally {
		contract.free();
	}
}

describe("a deployed covenant's parameters", () => {
	test("reproduce the script the protocol's own document says its factory is locked by", () => {
		expect(scriptPubKeyFor(ARGUMENTS)).toBe(DEPLOYED_SCRIPT_PUB_KEY);
	});

	test("and the address that script is written as", () => {
		const contract = new smplx.Contract(source, ARGUMENTS, "[]", DEBUG_SYMBOLS);

		expect(contract.contractAddress("liquid")).toBe(
			"ex1pg45gz7zucl2krj42qk0q9udzsgcxd0vxqs3ej6l286fvvgdmqe9s5w0cfg",
		);

		contract.free();
	});

	// Without the mode the document declares, the same two integers build a different covenant.
	// The check is here rather than in a comment because the mode is read from a field that was
	// renamed once already.
	test("only in the mode the document declares them built in", () => {
		expect(scriptPubKeyFor(ARGUMENTS, false)).not.toBe(DEPLOYED_SCRIPT_PUB_KEY);
	});
});

/**
 * Why the integers are written as decimal, demonstrated rather than asserted in prose.
 *
 * The compiler reads `0x…` as a hexadecimal literal of exactly the type's width. A count of 2
 * hex-prefixed is `0x2`, which is one digit and no whole number of bytes, so it fails loudly.
 * That is the harmless half. The dangerous half is a value whose decimal spelling happens to
 * be a legal width: it compiles, it derives an address, and it is a different number.
 */
describe("the encoding that would have been wrong", () => {
	test("a hex-prefixed count of the wrong width is refused by the compiler", () => {
		const wrong = ARGUMENTS.replace('"value":"2"', '"value":"0x2"');

		expect(() => scriptPubKeyFor(wrong)).toThrow();
	});

	test("but a hex-prefixed value of the right width is a different number, silently", () => {
		const asDecimal = ARGUMENTS.replace(
			'"REISSUANCE_FLAGS":{"type":"u64","value":"0"}',
			'"REISSUANCE_FLAGS":{"type":"u64","value":"1000000000000000"}',
		);
		const asHex = ARGUMENTS.replace(
			'"REISSUANCE_FLAGS":{"type":"u64","value":"0"}',
			'"REISSUANCE_FLAGS":{"type":"u64","value":"0x1000000000000000"}',
		);

		// Both compile. Both derive a valid address. Neither reports anything.
		expect(scriptPubKeyFor(asDecimal)).toMatch(/^5120[0-9a-f]{64}$/);
		expect(scriptPubKeyFor(asHex)).toMatch(/^5120[0-9a-f]{64}$/);
		expect(scriptPubKeyFor(asDecimal)).not.toBe(scriptPubKeyFor(asHex));
	});
});
