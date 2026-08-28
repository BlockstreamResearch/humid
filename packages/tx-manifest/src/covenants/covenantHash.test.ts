import { describe, expect, test } from "bun:test";

import { type CompileScriptPubKey, covenantHashFrom } from "./covenantHash";

// A covenant script hash is SHA256 of the scriptPubKey the contract compiles to — the value
// the Simplicity `input_script_hash` jet returns, and what a manifest's *_COV_HASH fields
// hold. What is asserted here is that this computes that and nothing else; whether the
// scriptPubKey itself is right is the compiler's business and is covered against the real
// module elsewhere.

/** A contract with no leaves, which is what most of these cases are about. */
const bare = { argumentsJson: "{}", extraLeavesJson: "[]", source: "a" };
const hashWith = (compile: CompileScriptPubKey) => covenantHashFrom(compile, false);

describe("covenantHashFrom", () => {
	test("hashes the scriptPubKey the contract compiles to", () => {
		const hash = hashWith(() => "00")({ ...bare, source: "fn main() { }" });

		// SHA256 of the single byte 0x00.
		expect(hash).toBe("6e340b9cffb37a989ca544e6bb780a2c78901d3fb33738768511a30617afa01d");
	});

	test("a different scriptPubKey gives a different hash", () => {
		const one = hashWith(() => "00")(bare);
		const other = hashWith(() => "01")(bare);

		expect(one).not.toBe(other);
	});

	test("hashes the bytes rather than the text of the hex", () => {
		const lower = hashWith(() => "abcd")(bare);
		const upper = hashWith(() => "ABCD")(bare);

		expect(lower).toBe(upper);
	});

	test("passes the source, arguments and leaves through to the compiler unchanged", () => {
		const seen: Parameters<CompileScriptPubKey>[0][] = [];

		hashWith((input) => {
			seen.push(input);

			return "00";
		})({ argumentsJson: '{"A":1}', extraLeavesJson: '["aa"]', source: "fn main() { }" });

		expect(seen).toEqual([
			{
				argumentsJson: '{"A":1}',
				extraLeavesJson: '["aa"]',
				includeDebugSymbols: false,
				source: "fn main() { }",
			},
		]);
	});

	// The mode is bound once for a whole document rather than passed per call, so this is the
	// only place it can be got wrong — and the same parameters build a different covenant in the
	// other mode, which is measured against the deployed protocol elsewhere.
	test("compiles in the build mode it was bound with", () => {
		const seen: boolean[] = [];
		const compile: CompileScriptPubKey = ({ includeDebugSymbols }) => {
			seen.push(includeDebugSymbols);

			return "00";
		};

		covenantHashFrom(compile, true)(bare);
		covenantHashFrom(compile, false)(bare);

		expect(seen).toEqual([true, false]);
	});

	test("refuses a scriptPubKey that is not hex rather than hashing the text", () => {
		expect(() => hashWith(() => "zz")(bare)).toThrow();
	});
});
