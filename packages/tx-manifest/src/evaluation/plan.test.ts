import { describe, expect, test } from "bun:test";

import p2pkManifest from "../__fixtures__/p2pk/txmanifest.json";
import type { Action } from "../document/manifest";
import type { ReferenceScope } from "../document/references";
import { Refusal } from "../refusal";
import { planAction } from "./plan";

const PUBKEY = "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
const MANIFEST = p2pkManifest as unknown as Record<string, unknown>;
const PAY = action(
	"Pay",
	(MANIFEST.actions as Record<string, Record<string, unknown>>).Pay as Record<string, unknown>,
);

function action(name: string, node: Record<string, unknown>): Action {
	return { isConstructor: false, name, node };
}

function scope(params: Record<string, unknown>): ReferenceScope {
	return { params };
}

describe("planAction", () => {
	test("resolves the covenant amount from the request's parameters", () => {
		const plan = planAction(PAY, scope({ amount_sat: 50_000, pubkey: PUBKEY }));

		expect(plan.fundingSats).toBe(50_000n);
		expect(plan.outputs).toContainEqual({
			blinding: { blinding: "open", decidedBy: "unblindable" },
			id: "p2pk_out",
			sats: 50_000n,
			target: { kind: "covenant", utxoType: "p2pk_output" },
		});
	});

	test("leaves change without an amount, because it is whatever survives the fee", () => {
		const plan = planAction(PAY, scope({ amount_sat: 50_000, pubkey: PUBKEY }));
		const change = plan.outputs.find((output) => output.target.kind === "change");

		expect(change).toBeDefined();
		expect(change?.sats).toBeUndefined();
	});

	test("keeps an amount beyond a double's range exact", () => {
		const plan = planAction(PAY, scope({ amount_sat: "9007199254740993", pubkey: PUBKEY }));

		expect(plan.fundingSats).toBe(9_007_199_254_740_993n);
	});

	test("refuses an amount it cannot evaluate rather than assuming one", () => {
		expect(() =>
			planAction(PAY, scope({ amount_sat: "will_in.amount_sat - fee", pubkey: PUBKEY })),
		).toThrow(Refusal);
	});

	test("refuses when the referenced parameter was not supplied", () => {
		expect(() => planAction(PAY, scope({ pubkey: PUBKEY }))).toThrow(Refusal);
	});

	test("refuses an output that would pay nothing", () => {
		expect(() => planAction(PAY, scope({ amount_sat: 0, pubkey: PUBKEY }))).toThrow(Refusal);
	});

	test("refuses a destination it does not resolve", () => {
		const odd = action("Odd", {
			outputs: [{ amount_sat: 1, destination: { if: "something" }, id: "odd" }],
		});

		expect(() => planAction(odd, scope({ amount_sat: 1, pubkey: PUBKEY }))).toThrow(Refusal);
	});

	test("refuses an action with no outputs", () => {
		const empty = action("Empty", { outputs: [] });

		expect(() => planAction(empty, scope({ amount_sat: 1, pubkey: PUBKEY }))).toThrow(Refusal);
	});
});
