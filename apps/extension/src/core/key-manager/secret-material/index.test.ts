import { describe, expect, test } from "bun:test";

import { keyManagerSecretMaterial } from "./index";

describe("a recovery phrase", () => {
	test("is valid with 12 words", () => {
		expect(
			keyManagerSecretMaterial.isValidMnemonic(keyManagerSecretMaterial.generateMnemonic()),
		).toBe(true);
	});

	test("is rejected with 24 words, even when the checksum holds", () => {
		const twentyFour = `${"abandon ".repeat(23)}art`;

		expect(keyManagerSecretMaterial.isValidMnemonic(twentyFour)).toBe(false);
	});
});
