import { describe, expect, test } from "bun:test";

import { SignatureScope } from "./SignatureScope";

const warning = (sighashType: number, input = 1, outputCount = 3) =>
	new SignatureScope(sighashType, input, outputCount).warning;

describe("the warning a signature scope carries", () => {
	test("none for a signature over the whole transaction", () => {
		expect(warning(0)).toBeUndefined();
		expect(warning(1)).toBeUndefined();
		expect(warning(0x41)).toBeUndefined();
	});

	test("names the paired output for a single-output signature", () => {
		expect(warning(0x83)).toBe(
			"The signature on input 2 covers only that input and output 2. Whoever holds the signed transaction can change everything else.",
		);
		expect(warning(3)).toBe(
			"The signature on input 2 covers every input and output 2. Whoever holds the signed transaction can change the other outputs.",
		);
	});

	test("treats a single-output signature with no paired output as covering no outputs", () => {
		expect(warning(3, 3)).toBe(
			"The signature on input 4 covers every input and no outputs. Whoever holds the signed transaction can send these funds anywhere.",
		);
	});

	test("warns of a signature over no outputs, or over one input only", () => {
		expect(warning(2)).toContain("can send these funds anywhere");
		expect(warning(0x81)).toBe(
			"The signature on input 2 covers only that input and every output. Others can add inputs to the transaction.",
		);
	});

	test("flags a scope the wallet has no word for", () => {
		expect(warning(4)).toBe("Input 2 asks for a signature the wallet does not recognise.");
	});
});
