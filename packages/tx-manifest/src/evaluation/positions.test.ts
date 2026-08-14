import { describe, expect, test } from "bun:test";

import dex from "../__fixtures__/current/dex.manifest.json";
import lendingV2 from "../__fixtures__/current/lending_v2.manifest.json";
import lendingV3 from "../__fixtures__/current/lending_v3.manifest.json";
import { asArray, asRecord } from "../document/json";
import { normaliseManifest } from "../document/normalise";
import { checkPositions } from "./positions";

const STATING = { dex, lending_v2: lendingV2, lending_v3: lendingV3 } as unknown as Record<
	string,
	Record<string, unknown>
>;

describe("a position the document states", () => {
	test("is met when the piece lands there", () => {
		expect(
			checkPositions([{ at: 2, id: "collateral_in", kind: "input", stated: 2 }], {
				inputs: 4,
				outputs: 4,
			}).ok,
		).toBe(true);
	});

	// The step that cannot be skipped: a negative index counts from the end, so it cannot be
	// read without knowing how many there are. Read as an absolute one it would place the
	// piece somewhere else entirely.
	test("counts from the end when it is negative", () => {
		const last = { at: 3, id: "fee_change", kind: "output" as const, stated: -1 };

		expect(checkPositions([last], { inputs: 2, outputs: 4 }).ok).toBe(true);
		expect(checkPositions([last], { inputs: 2, outputs: 5 }).ok).toBe(false);
	});

	test("refuses by naming both the position asked for and the one it would get", () => {
		const check = checkPositions([{ at: 0, id: "collateral_in", kind: "input", stated: 2 }], {
			inputs: 3,
			outputs: 3,
		});

		expect(check.ok).toBe(false);

		if (!check.ok) {
			expect(check.reason).toContain("collateral_in");
			expect(check.reason).toContain("input 2");
			expect(check.reason).toContain("0");
		}
	});
});

describe("what the published protocols ask for", () => {
	// Eighty-eight stated positions across the three protocols that state any, and all but two
	// are simply the order the document declares things in. The two are change outputs counted
	// from the end, which is why the negative form had to be read rather than treated as odd.
	test("is nearly always the order they are declared in", () => {
		let stated = 0;
		let matchingDeclaration = 0;
		let fromTheEnd = 0;

		for (const name of Object.keys(STATING)) {
			const { manifest } = normaliseManifest(STATING[name]!);

			for (const action of manifest.actions) {
				for (const kind of ["inputs", "outputs"] as const) {
					for (const [at, entry] of asArray(action.node[kind]).entries()) {
						const declared = asRecord(entry)?.required_index;

						if (typeof declared !== "number") {
							continue;
						}

						stated += 1;
						fromTheEnd += declared < 0 ? 1 : 0;
						matchingDeclaration += declared === at ? 1 : 0;
					}
				}
			}
		}

		expect({ fromTheEnd, matchingDeclaration, stated }).toEqual({
			fromTheEnd: 2,
			matchingDeclaration: 86,
			stated: 88,
		});
	});
});
