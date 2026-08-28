import { describe, expect, test } from "bun:test";

import lending from "../__fixtures__/lending.manifest.json";
import lendingV2 from "../__fixtures__/lending_v2.manifest.json";
import lendingV3 from "../__fixtures__/lending_v3.manifest.json";
import { asArray, asRecord } from "../document/json";
import { normaliseManifest } from "../document/normalise";
import type { ReferenceScope } from "../document/references";
import { declaredIssuance, issuanceAttributes, resolveIssuance } from "./issuance";

/** The three protocols in the corpus that create assets, across their generations. */
const ISSUING = { lending, lending_v2: lendingV2, lending_v3: lendingV3 } as unknown as Record<
	string,
	Record<string, unknown>
>;

/** An output of this wallet's, standing for whichever one the review commits to. */
const OUTPOINT = { txid: "c".repeat(64), vout: 0 };

/** Every issuance the corpus declares, with the input carrying it. */
function issuancesIn(document: Record<string, unknown>) {
	const { manifest } = normaliseManifest(document);
	const found: { declared: Record<string, unknown>; id: string }[] = [];

	for (const action of manifest.actions) {
		for (const entry of asArray(action.node.inputs)) {
			const input = asRecord(entry);
			const declared = input && declaredIssuance(input);

			if (input && declared) {
				found.push({ declared, id: typeof input.id === "string" ? input.id : "(unnamed)" });
			}
		}
	}

	return found;
}

/** The values the two formula-bearing issuances in the corpus read, under both spellings. */
const SCOPE: ReferenceScope = {
	instance: { FIRST_PARAMETERS_ENCODED: "5000", SECOND_PARAMETERS_ENCODED: "7000" },
	params: {},
};

describe("the issuances real protocols declare", () => {
	// Eleven across three generations, and every one of them creates rather than reissues.
	// A branch for the other kind would be a branch nothing in the published corpus reaches.
	test("are all first issuances", () => {
		const kinds = new Set<unknown>();

		for (const name of Object.keys(ISSUING)) {
			for (const { declared } of issuancesIn(ISSUING[name]!)) {
				kinds.add(declared.kind);
			}
		}

		expect([...kinds]).toEqual(["new"]);
	});

	test("are each resolved to an asset", () => {
		for (const name of Object.keys(ISSUING)) {
			const found = issuancesIn(ISSUING[name]!);

			expect({ [name]: found.length }).not.toEqual({ [name]: 0 });

			for (const { declared, id } of found) {
				const resolved = resolveIssuance({ declared, id, outpoint: OUTPOINT }, SCOPE, []);

				expect({ [`${name} / ${id}`]: resolved.ok }).toEqual({ [`${name} / ${id}`]: true });
			}
		}
	});

	// Two of them say how much they create with an expression rather than a number, and the
	// two generations spell the same lookup differently. Reading one and not the other would
	// leave the older protocol issuing an amount nobody worked out.
	test("read an amount written as an expression, in either generation's spelling", () => {
		const amounts: Record<string, bigint> = {};

		for (const name of ["lending", "lending_v2"]) {
			for (const { declared, id } of issuancesIn(ISSUING[name]!)) {
				if (typeof declared.asset_amount_sat !== "string") {
					continue;
				}

				const resolved = resolveIssuance({ declared, id, outpoint: OUTPOINT }, SCOPE, []);

				if (resolved.ok) {
					amounts[`${name} / ${id}`] = resolved.issuance.assetAmountSats;
				}
			}
		}

		expect(amounts).toEqual({
			"lending / first_params_issuance_input": 5000n,
			"lending / second_params_issuance_input": 7000n,
			"lending_v2 / first_params_issuance_input": 5000n,
			"lending_v2 / second_params_issuance_input": 7000n,
		});
	});

	// The one the wallet does not choose an output for: its input spends a covenant the state
	// file named, so the asset is derived from that outpoint and not from the wallet's coins.
	test("include one issued from a covenant rather than from the wallet's own output", () => {
		const covenantSourced = issuancesIn(ISSUING.lending_v3!).filter(({ id }) =>
			id.endsWith("covenant_in"),
		);

		expect(covenantSourced.length).toBe(1);
	});
});

describe("what an issued asset is derived from", () => {
	test("is the output the input spends, so two inputs never create one asset", () => {
		const declared = { asset_amount_sat: 1, inflation_amount_sat: 0, kind: "new" };
		const first = resolveIssuance({ declared, id: "a", outpoint: OUTPOINT }, SCOPE, []);
		const second = resolveIssuance(
			{ declared, id: "b", outpoint: { ...OUTPOINT, vout: 1 } },
			SCOPE,
			[],
		);

		expect(first.ok && second.ok).toBe(true);

		if (!first.ok || !second.ok) {
			return;
		}

		expect(first.issuance.asset).not.toBe(second.issuance.asset);
	});

	// Inside the input's own hook, `asset` is what the input creates rather than what the
	// output it spends was holding. A hook reading the second would write the funding asset
	// into a field the covenant is then compiled with.
	test("is what the input's own hook reads under the bare name", () => {
		const resolved = resolveIssuance(
			{
				declared: { asset_amount_sat: 2, inflation_amount_sat: 0, kind: "new" },
				id: "factory_issuance_input",
				outpoint: OUTPOINT,
			},
			SCOPE,
			[],
		);

		expect(resolved.ok).toBe(true);

		if (!resolved.ok) {
			return;
		}

		expect(issuanceAttributes(resolved.issuance)).toEqual({
			asset: resolved.issuance.asset,
			reissuance_token: resolved.issuance.reissuanceToken,
		});
	});
});

describe("the issuances this wallet refuses", () => {
	test("a reissuance, naming what it has nothing to derive from", () => {
		const resolved = resolveIssuance(
			{
				declared: { asset_amount_sat: 1, kind: "reissue" },
				id: "top_up",
				outpoint: OUTPOINT,
			},
			SCOPE,
			[],
		);

		expect(resolved.ok).toBe(false);

		if (resolved.ok) {
			return;
		}

		expect(resolved.reject).toBe("unimplemented-construct");
		expect(resolved.reason).toContain("entropy");
	});

	// A token has to be held confidentially on Liquid and every value this wallet builds is
	// explicit, so minting one would produce a token nobody could spend.
	test("a minted reissuance token", () => {
		const resolved = resolveIssuance(
			{
				declared: { asset_amount_sat: 1, inflation_amount_sat: 1, kind: "new" },
				id: "factory_issuance_input",
				outpoint: OUTPOINT,
			},
			SCOPE,
			[],
		);

		expect(resolved.ok).toBe(false);

		if (resolved.ok) {
			return;
		}

		expect(resolved.reject).toBe("unimplemented-construct");
	});

	test("a kind the format does not define", () => {
		const resolved = resolveIssuance(
			{
				declared: { asset_amount_sat: 1, kind: "burn" },
				id: "an_input",
				outpoint: OUTPOINT,
			},
			SCOPE,
			[],
		);

		expect(resolved.ok && "unreachable").toBe(false);

		if (resolved.ok) {
			return;
		}

		expect(resolved.reject).toBe("document-fault");
	});

	test("an amount that creates nothing", () => {
		const resolved = resolveIssuance(
			{
				declared: { asset_amount_sat: 0, kind: "new" },
				id: "an_input",
				outpoint: OUTPOINT,
			},
			SCOPE,
			[],
		);

		expect(resolved.ok).toBe(false);
	});

	// How much of an asset exists cannot depend on what the transaction costs to send: the
	// fee comes from the shape of the transaction the amount appears in.
	test("an amount worked out from the fee", () => {
		const resolved = resolveIssuance(
			{
				declared: { asset_amount_sat: "fee", kind: "new" },
				id: "an_input",
				outpoint: OUTPOINT,
			},
			{ ...SCOPE, fee: 500n },
			[],
		);

		expect(resolved.ok).toBe(false);
	});
});
