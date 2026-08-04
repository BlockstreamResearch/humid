import { describe, expect, test } from "bun:test";

import { covenantHashFrom } from "./covenantHash";

// A covenant script hash is SHA256 of the scriptPubKey the contract compiles to — the value
// the Simplicity `input_script_hash` jet returns, and what a manifest's *_COV_HASH fields
// hold. What is asserted here is that this computes that and nothing else; whether the
// scriptPubKey itself is right is the compiler's business and is covered against the real
// module elsewhere.

describe("covenantHashFrom", () => {
	test("hashes the scriptPubKey the contract compiles to", () => {
		const hash = covenantHashFrom(() => "00")({ argumentsJson: "{}", source: "fn main() { }" });

		// SHA256 of the single byte 0x00.
		expect(hash).toBe("6e340b9cffb37a989ca544e6bb780a2c78901d3fb33738768511a30617afa01d");
	});

	test("a different scriptPubKey gives a different hash", () => {
		const one = covenantHashFrom(() => "00")({ argumentsJson: "{}", source: "a" });
		const other = covenantHashFrom(() => "01")({ argumentsJson: "{}", source: "a" });

		expect(one).not.toBe(other);
	});

	test("hashes the bytes rather than the text of the hex", () => {
		const lower = covenantHashFrom(() => "abcd")({ argumentsJson: "{}", source: "a" });
		const upper = covenantHashFrom(() => "ABCD")({ argumentsJson: "{}", source: "a" });

		expect(lower).toBe(upper);
	});

	test("passes the source and arguments through to the compiler unchanged", () => {
		const seen: { argumentsJson: string; source: string }[] = [];

		covenantHashFrom((input) => {
			seen.push(input);

			return "00";
		})({ argumentsJson: '{"A":1}', source: "fn main() { }" });

		expect(seen).toEqual([{ argumentsJson: '{"A":1}', source: "fn main() { }" }]);
	});

	test("refuses a scriptPubKey that is not hex rather than hashing the text", () => {
		expect(() => covenantHashFrom(() => "zz")({ argumentsJson: "{}", source: "a" })).toThrow();
	});
});
