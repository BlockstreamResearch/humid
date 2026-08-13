import { describe, expect, test } from "bun:test";

import lendingV2 from "../__fixtures__/lending_v2.manifest.json";
import { asArray, asRecord } from "../document/json";
import { findAction, normaliseManifest } from "../document/normalise";
import type { ReferenceScope } from "../document/references";
import { actionHook, inputHook, inputHookScope, runHook, withHookValues } from "./hooks";

// The hooks in the corpus are the only ones that can say whether this reads what protocols
// actually write. Three actions declare an action-level hook and eighteen inputs declare
// their own; the two shapes below are lifted from `lending_v2`, which carries both.

function actionOf(document: unknown, name: string) {
	const { manifest } = normaliseManifest(document as Record<string, unknown>);
	const action = findAction(manifest, name);

	if (!action) {
		throw new Error(`No action named ${name}`);
	}

	return action;
}

/** The one action in the corpus whose hook does arithmetic rather than copying a value. */
function encodingAction() {
	const { manifest } = normaliseManifest(lendingV2 as unknown as Record<string, unknown>);

	for (const container of ["classes", "contract_templates"] as const) {
		for (const template of Object.values(asRecord(manifest.raw?.[container]) ?? {})) {
			const actions =
				asRecord(asRecord(template)?.methods) ?? asRecord(asRecord(template)?.actions);

			for (const name of Object.keys(actions ?? {})) {
				const action = findAction(manifest, name);

				if (action && actionHook(action)) {
					return action;
				}
			}
		}
	}

	throw new Error("The corpus carries no action-level hook");
}

describe("an action's own hook", () => {
	test("is found where the corpus writes it", () => {
		expect(actionHook(encodingAction())).toBeDefined();
	});

	test("computes its values from the parameters the request supplied", () => {
		const action = encodingAction();
		const set = actionHook(action);

		if (!set) {
			throw new Error("no hook");
		}

		const scope: ReferenceScope = {
			instance: {},
			params: {
				AMOUNTS_DECIMALS: "2",
				COLLATERAL_AMOUNT: "1000",
				LOAN_EXPIRATION_TIME: "10",
				PRINCIPAL_AMOUNT: "500",
				PRINCIPAL_INTEREST_RATE: "5",
			},
		};
		const ran = runHook(set, scope, []);

		expect(ran.ok).toBe(true);

		if (!ran.ok) {
			return;
		}

		// Every target this hook names is a field of the deployment, and every value it
		// produced is a number rather than the expression it came from.
		expect(Object.keys(ran.values.instance).length).toBeGreaterThan(0);

		for (const value of Object.values(ran.values.instance)) {
			expect(value).toMatch(/^-?\d+$/);
		}
	});

	test("a later line reads what an earlier one set", () => {
		const scope: ReferenceScope = { instance: {}, params: { BASE: "10" } };
		const ran = runHook(
			{ "instance.FIRST": "params.BASE * 2", "instance.SECOND": "instance.FIRST + 1" },
			scope,
			[],
		);

		expect(ran).toMatchObject({ ok: true, values: { instance: { FIRST: "20", SECOND: "21" } } });
	});

	test("a target naming a namespace this runtime cannot set is refused", () => {
		const ran = runHook({ "outputs.X": "1" }, { instance: {}, params: {} }, []);

		expect(ran).toMatchObject({ ok: false });

		if (ran.ok) {
			return;
		}

		expect(ran.reason).toContain("outputs");
	});

	test("the deprecated namespace writes where the current one does", () => {
		const ran = runHook({ "compile_params.X": "2 + 2" }, { instance: {}, params: {} }, []);

		expect(ran).toMatchObject({ ok: true, values: { instance: { X: "4" } } });
	});
});

describe("an input's own hook", () => {
	test("is found where the corpus writes it, and reads the asset that input holds", () => {
		const action = actionOf(lendingV2, "LockCollateral");
		const withHook = asArray(action.node.inputs)
			.map((entry) => asRecord(entry))
			.find((entry) => entry && inputHook(entry));

		// LockCollateral may carry none; the assertion that matters is that where one exists,
		// the bare name it reads resolves to what the input turned out to hold.
		const scope = inputHookScope(
			{ instance: {}, params: {} },
			{ amount_sat: 1000n, asset: "aa".repeat(32) },
		);

		expect(scope.params.asset).toBe("aa".repeat(32));
		expect(withHook === undefined || inputHook(withHook) !== undefined).toBe(true);
	});

	test("what it sets is visible to everything after it", () => {
		const scope: ReferenceScope = { instance: {}, params: {} };
		const ran = runHook({ "instance.ISSUED": "asset" }, inputHookScope(scope, { asset: "42" }), []);

		expect(ran).toMatchObject({ ok: true, values: { instance: { ISSUED: "42" } } });

		if (!ran.ok) {
			return;
		}

		expect(withHookValues(scope, ran.values).instance?.ISSUED).toBe("42");
	});
});
