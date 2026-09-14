import { describe, expect, test } from "bun:test";

import p2pkManifest from "../__fixtures__/p2pk.manifest.json";
import type { ParsedLiquidProcessCtParams } from "../request/request";
import { planAction } from "./plan";

const PUBKEY = "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
const MANIFEST = p2pkManifest as unknown as Record<string, unknown>;
const PAY = (MANIFEST.actions as Record<string, Record<string, unknown>>).Pay;

function request(params: Record<string, unknown>): ParsedLiquidProcessCtParams {
	return {
		action: "Pay",
		broadcast: false,
		contractSources: {},
		manifest: MANIFEST,
		params,
	};
}

describe("planAction", () => {
	// Pay declares two outputs: the covenant, whose amount is params.amount_sat, and an
	// optional change output.
	test("resolves the covenant amount from the request's parameters", () => {
		const result = planAction(request({ amount_sat: 50_000, pubkey: PUBKEY }), PAY);

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
		const result = planAction(request({ amount_sat: 50_000, pubkey: PUBKEY }), PAY);

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
		const result = planAction(request({ amount_sat: huge, pubkey: PUBKEY }), PAY);

		expect(result).toMatchObject({ ok: true });

		if (result.ok) {
			expect(result.plan.fundingSats).toBe(9_007_199_254_740_993n);
		}
	});

	test("refuses an amount it cannot evaluate rather than assuming one", () => {
		const result = planAction(
			request({ amount_sat: "will_in.amount_sat - fee", pubkey: PUBKEY }),
			PAY,
		);

		expect(result).toMatchObject({ ok: false });
	});

	test("refuses when the referenced parameter was not supplied", () => {
		const result = planAction(request({ pubkey: PUBKEY }), PAY);

		expect(result).toMatchObject({ ok: false });
	});

	test("refuses an output that would pay nothing", () => {
		const result = planAction(request({ amount_sat: 0, pubkey: PUBKEY }), PAY);

		expect(result).toMatchObject({ ok: false });
	});

	test("refuses a destination it does not resolve", () => {
		const result = planAction(request({ amount_sat: 1, pubkey: PUBKEY }), {
			outputs: [{ amount_sat: 1, destination: { if: "something" }, id: "odd" }],
		});

		expect(result).toMatchObject({ ok: false });
	});

	test("refuses an action with no outputs", () => {
		const result = planAction(request({ amount_sat: 1, pubkey: PUBKEY }), { outputs: [] });

		expect(result).toMatchObject({ ok: false });
	});
});
