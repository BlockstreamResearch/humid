import { describe, expect, test } from "bun:test";

import dex from "../__fixtures__/current/dex.manifest.json";
import lastWill from "../__fixtures__/current/last_will.manifest.json";
import lendingV2 from "../__fixtures__/current/lending_v2.manifest.json";
import lendingV3 from "../__fixtures__/current/lending_v3.manifest.json";
import { findAction, normaliseManifest } from "../document/normalise";
import type { ReferenceScope } from "../document/references";
import { resolveStaticWitnesses } from "./witness";

const CORPUS = {
	dex,
	last_will: lastWill,
	lending_v2: lendingV2,
	lending_v3: lendingV3,
} as unknown as Record<string, Record<string, unknown>>;

function actionsOf(document: Record<string, unknown>) {
	return normaliseManifest(document).manifest.actions;
}

const EMPTY: ReferenceScope = { instance: {}, params: {} };

/** The one field a published witness value reads, with a figure that is unmistakable in output. */
const DEPLOYED: ReferenceScope = { instance: { CURRENT_DEBT: "4200" }, params: {} };

/** One covenant input carrying one witness, for the shapes no published protocol writes. */
function witnessAction(witness: Record<string, unknown>) {
	const { manifest } = normaliseManifest({
		actions: {
			Spend: {
				inputs: [
					{ id: "covenant_in", utxo_source: { utxo_type: "v" }, witnesses: { PATH: witness } },
				],
			},
		},
	});

	return manifest.actions[0]!;
}

describe("the values published protocols state for their witnesses", () => {
	// Every branch selector in the corpus, read at once. A protocol whose witness cannot be
	// produced cannot be performed at all, so the number that resolve is the number of spends
	// this wallet could reach.
	test("all of them resolve, in every protocol that states one", () => {
		const stated: Record<string, number> = {};

		for (const name of Object.keys(CORPUS)) {
			let count = 0;

			for (const action of actionsOf(CORPUS[name]!)) {
				const resolved = resolveStaticWitnesses(action, DEPLOYED, []);

				expect({ [`${name} / ${action.name}`]: resolved.ok }).toEqual({
					[`${name} / ${action.name}`]: true,
				});

				if (resolved.ok) {
					for (const values of resolved.witnesses.values()) {
						count += values.length;
					}
				}
			}

			stated[name] = count;
		}

		// Counted from the documents themselves: every witness the four protocols declare, less
		// the five that are signatures. Thirty-one stated values, once per action that spends.
		expect(stated).toEqual({ dex: 2, last_will: 3, lending_v2: 18, lending_v3: 8 });
	});

	// The language's own words are not references and must survive untouched. A runtime that
	// substituted `Left` would choose a different branch of the contract than the document did.
	test("a literal is carried through exactly as the document wrote it", () => {
		const action = findAction(normaliseManifest(CORPUS.last_will!).manifest, "Inherit");
		const resolved = action && resolveStaticWitnesses(action, EMPTY, []);

		expect(resolved?.ok).toBe(true);

		if (!resolved?.ok) {
			return;
		}

		const [stated] = [...resolved.witnesses.values()].flat();

		expect(stated?.value).toBe("Left(())");
		expect(stated?.simplicityType).toBe("Either<(), Either<(), ()>>");
	});
});

describe("the one value in the corpus that is not a literal", () => {
	/** The action whose branch carries a field of its own deployment. */
	function repaying() {
		for (const action of actionsOf(CORPUS.lending_v3!)) {
			const resolved = resolveStaticWitnesses(action, DEPLOYED, []);

			if (resolved.ok) {
				for (const values of resolved.witnesses.values()) {
					for (const stated of values) {
						if (stated.value.includes("4200")) {
							return stated;
						}
					}
				}
			}
		}

		return undefined;
	}

	test("reads the deployment field named inside it and leaves the rest alone", () => {
		expect(repaying()?.value).toBe("Right(Left(Right(4200)))");
	});

	// A branch selected from a field nobody supplied is the one case where carrying on would
	// hand the contract a different branch than the document chose, so it refuses instead.
	test("refuses when the field it names was not supplied", () => {
		const failures = actionsOf(CORPUS.lending_v3!)
			.map((action) => resolveStaticWitnesses(action, EMPTY, []))
			.filter((resolved) => !resolved.ok);

		expect(failures.length).toBe(1);
		expect(failures[0]?.ok === false && failures[0].reason).toContain("CURRENT_DEBT");
	});
});

describe("what a stated witness cannot be", () => {
	test("a value with no type is refused, naming the input", () => {
		const resolved = resolveStaticWitnesses(
			witnessAction({ type: "simplicityhl", value: "Left(())" }),
			EMPTY,
			[],
		);

		expect(resolved.ok).toBe(false);

		if (!resolved.ok) {
			expect(resolved.reason).toContain("covenant_in");
		}
	});

	test("a type with no value is refused", () => {
		expect(
			resolveStaticWitnesses(
				witnessAction({ simplicity_type: "u32", type: "simplicityhl" }),
				EMPTY,
				[],
			).ok,
		).toBe(false);
	});

	// An attribute of a resolved input is not a form this site accepts. Left in place it would
	// reach the compiler as a word it cannot parse, and resolved it would admit a lookup no
	// published protocol exercises.
	test("a name this position does not accept is refused rather than passed on", () => {
		const resolved = resolveStaticWitnesses(
			witnessAction({
				simplicity_type: "u32",
				type: "simplicityhl",
				value: "Left(covenant_in.amount_sat)",
			}),
			EMPTY,
			[],
		);

		expect(resolved.ok).toBe(false);
	});
});
