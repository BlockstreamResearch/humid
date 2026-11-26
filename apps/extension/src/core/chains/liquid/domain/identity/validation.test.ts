import { expect, test } from "bun:test";

import { parseLiquidSignIdentityParams } from "./validation";

const sign = (identity: string, challenge: string) =>
	parseLiquidSignIdentityParams({ challenge, curve: "nist256p1", identity });

const DIGEST = "ab".repeat(32);

test("an ssh identity signs a challenge of any length, since the wallet hashes the challenge first", () => {
	expect(sign("ssh://humid@localhost", "4c6f67").challenge).toBe("4c6f67");
	expect(sign("ssh://humid@localhost", DIGEST).challenge).toBe(DIGEST);
});

test("any other identity signs only a 32-byte digest, which the wallet signs as given", () => {
	expect(sign("https://app.example.org", DIGEST).challenge).toBe(DIGEST);

	for (const challenge of ["4c6f67", `${DIGEST}00`, DIGEST.slice(2)]) {
		expect(() => sign("https://app.example.org", challenge)).toThrow(
			"Invalid signIdentity parameters.",
		);
	}
});
