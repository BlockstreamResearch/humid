import { describe, expect, test } from "bun:test";

import p2pkManifest from "../__fixtures__/p2pk.manifest.json";
import { findAction, type NormalisedAction, normaliseManifest } from "../document/normalise";
import type { ReferenceScope } from "../document/references";
import { planAction } from "./plan";

const PUBKEY = "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
const MANIFEST = normaliseManifest(p2pkManifest as unknown as Record<string, unknown>).manifest;
const PAY = findAction(MANIFEST, "Pay") as NormalisedAction;

function request(params: Record<string, unknown>): ReferenceScope {
	return { params };
}

/** An action written inline, for a shape the published manifest does not carry. */
function action(node: Record<string, unknown>): NormalisedAction {
	return { isConstructor: false, name: "Inline", node };
}

describe("planAction", () => {
	// Pay declares two outputs: the covenant, whose amount is params.amount_sat, and an
	// optional change output.
	test("resolves the covenant amount from the request's parameters", () => {
		const result = planAction(PAY, request({ amount_sat: 50_000, pubkey: PUBKEY }));

		expect(result).toMatchObject({ ok: true });

		if (result.ok) {
			expect(result.plan.fundingSats).toBe(50_000n);
			expect(result.plan.outputs).toContainEqual({
				id: "p2pk_out",
				sats: 50_000n,
				target: { kind: "covenant", utxoType: "p2pk_output" },
			});
		}
	});

	test("leaves change without an amount, because it is whatever survives the fee", () => {
		const result = planAction(PAY, request({ amount_sat: 50_000, pubkey: PUBKEY }));

		expect(result).toMatchObject({ ok: true });

		if (result.ok) {
			const change = result.plan.outputs.find((output) => output.target.kind === "change");

			expect(change).toBeDefined();
			expect(change?.sats).toBeUndefined();
		}
	});

	// Amounts are base units and must survive past 2^53, which a number cannot.
	test("keeps an amount beyond a double's range exact", () => {
		const huge = "9007199254740993";
		const result = planAction(PAY, request({ amount_sat: huge, pubkey: PUBKEY }));

		expect(result).toMatchObject({ ok: true });

		if (result.ok) {
			expect(result.plan.fundingSats).toBe(9_007_199_254_740_993n);
		}
	});

	test("refuses an amount whose terms it cannot resolve rather than assuming one", () => {
		const result = planAction(
			PAY,
			request({ amount_sat: "will_in.amount_sat - fee", pubkey: PUBKEY }),
		);

		expect(result).toMatchObject({ ok: false });
	});

	test("refuses when the referenced parameter was not supplied", () => {
		const result = planAction(PAY, request({ pubkey: PUBKEY }));

		expect(result).toMatchObject({ ok: false });
	});

	test("refuses an output that would pay nothing", () => {
		const result = planAction(PAY, request({ amount_sat: 0, pubkey: PUBKEY }));

		expect(result).toMatchObject({ ok: false });
	});

	test("refuses a destination it does not resolve", () => {
		const result = planAction(
			action({ outputs: [{ amount_sat: 1, destination: { if: "something" }, id: "odd" }] }),
			request({ amount_sat: 1, pubkey: PUBKEY }),
		);

		expect(result).toMatchObject({ ok: false });
	});

	test("refuses an action with no outputs", () => {
		const result = planAction(action({ outputs: [] }), request({ amount_sat: 1, pubkey: PUBKEY }));

		expect(result).toMatchObject({ ok: false });
	});
});

describe("planAction with resolved inputs", () => {
	const RECEIVE = findAction(MANIFEST, "Receive") as NormalisedAction;

	// Receive pays out what the covenant input holds, which the wallet reads from the chain
	// rather than being told.
	test("resolves an output amount from what an input actually holds", () => {
		const result = planAction(RECEIVE, {
			inputs: { p2pk_in: { amount_sat: 42_000n } },
			params: { pubkey: PUBKEY },
		});

		expect(result).toMatchObject({ ok: true });

		if (result.ok) {
			expect(result.plan.outputs).toContainEqual({
				id: "received_out",
				sats: 42_000n,
				target: { kind: "wallet" },
			});
		}
	});

	test("refuses when the referenced input was not resolved", () => {
		const result = planAction(RECEIVE, { inputs: {}, params: { pubkey: PUBKEY } });

		expect(result).toMatchObject({ ok: false });
	});
});

// Amounts are expressions, not single references. The fee is one term among the others,
// which is what lets a draft be planned against zero and re-planned against an estimate.
describe("planAction over expressions", () => {
	const RECEIVE = findAction(MANIFEST, "Receive") as NormalisedAction;

	function payOut(amount: unknown, scope: Partial<ReferenceScope> = {}) {
		return planAction(
			action({ outputs: [{ amount_sat: amount, destination: "wallet", id: "out" }] }),
			{
				params: { pubkey: PUBKEY },
				...scope,
			},
		);
	}

	test("pays what an input holds, less the wallet's fee", () => {
		const result = payOut("p2pk_in.amount_sat - fee", {
			fee: 500n,
			inputs: { p2pk_in: { amount_sat: 42_000n } },
		});

		expect(result).toMatchObject({ ok: true });

		if (result.ok) {
			expect(result.plan.outputs[0]?.sats).toBe(41_500n);
		}
	});

	// The same action planned twice against two fees is how the re-pass works: the fee is a
	// value in the scope, so nothing about the amount has to be re-parsed to change it.
	test("the same expression follows the fee it is given", () => {
		const scope = { inputs: { p2pk_in: { amount_sat: 42_000n } } };
		const draft = payOut("p2pk_in.amount_sat - fee", { ...scope, fee: 0n });
		const priced = payOut("p2pk_in.amount_sat - fee", { ...scope, fee: 500n });

		expect(draft.ok && draft.plan.outputs[0]?.sats).toBe(42_000n);
		expect(priced.ok && priced.plan.outputs[0]?.sats).toBe(41_500n);
	});

	test("refuses an amount referencing the fee before the wallet has one", () => {
		const result = payOut("p2pk_in.amount_sat - fee", {
			inputs: { p2pk_in: { amount_sat: 42_000n } },
		});

		expect(result).toMatchObject({ ok: false });
	});

	test("carries the expression into the refusal, so a person can act on it", () => {
		const result = payOut("nowhere * 2");

		expect(result.ok ? "" : result.reason).toContain("nowhere * 2");
	});

	test("still plans the published action, which needs no arithmetic", () => {
		const result = planAction(RECEIVE, {
			inputs: { p2pk_in: { amount_sat: 42_000n } },
			params: { pubkey: PUBKEY },
		});

		expect(result).toMatchObject({ ok: true });
	});
});
