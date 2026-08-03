import { describe, expect, test } from "bun:test";

import p2pkManifest from "./__fixtures__/p2pk.manifest.json";
import { resolveActionRequirements } from "./requirements";
import type { ParsedLiquidProcessCtParams } from "./types";

// The fixture is the published p2pk manifest at txmanifest-wallet
// 7d56516a1a1e44a586f25d45a34619c3953758dd, unmodified. Expectations below come from
// what that document says an action needs, not from what the resolver happens to return.

const SOURCE_PATH = "./p2pk.simf";
const PUBKEY = "0".repeat(64);

function request(
	overrides: Partial<ParsedLiquidProcessCtParams> = {},
): ParsedLiquidProcessCtParams {
	return {
		action: "Pay",
		broadcast: false,
		contractSources: { [SOURCE_PATH]: "fn main() {}" },
		manifest: p2pkManifest as unknown as Record<string, unknown>,
		params: { amount_sat: 1000, pubkey: PUBKEY },
		...overrides,
	};
}

describe("resolveActionRequirements", () => {
	test("refuses an action the manifest does not declare, naming it", () => {
		const { missing } = resolveActionRequirements(request({ action: "Withdraw" }));

		expect(missing).toHaveLength(1);
		expect(missing[0]?.reason).toContain("Withdraw");
	});

	// Pay locks funds into a new p2pk output: one wallet input, a covenant destination.
	// It reads no deployment state, so a request without instance or state is complete.
	describe("Pay", () => {
		test("needs the contract source and the declared parameters", () => {
			const { required } = resolveActionRequirements(request());

			expect(required).toContain("contractSources");
			expect(required).toContain("params");
		});

		test("does not need the instance or state files", () => {
			const { required } = resolveActionRequirements(request());

			expect(required).not.toContain("instance");
			expect(required).not.toContain("state");
		});

		test("is complete when the source and parameters are supplied", () => {
			expect(resolveActionRequirements(request()).missing).toEqual([]);
		});

		test("names the contract source that was not supplied", () => {
			const { missing } = resolveActionRequirements(request({ contractSources: {} }));
			const entry = missing.find((item) => item.part === "contractSources");

			expect(entry?.keys).toEqual([SOURCE_PATH]);
		});

		test("names each parameter the request did not fill", () => {
			const { missing } = resolveActionRequirements(request({ params: { pubkey: PUBKEY } }));
			const entry = missing.find((item) => item.part === "params");

			expect(entry?.keys).toEqual(["amount_sat"]);
		});
	});

	// Receive spends the covenant UTXO, which the manifest locates by utxo_type — a lookup
	// into the state file rather than into the chain.
	describe("Receive", () => {
		const receive = (overrides: Partial<ParsedLiquidProcessCtParams> = {}) =>
			resolveActionRequirements(
				request({ action: "Receive", params: { pubkey: PUBKEY }, ...overrides }),
			);

		test("needs the state file", () => {
			expect(receive().required).toContain("state");
		});

		test("refuses without it, saying why", () => {
			const entry = receive().missing.find((item) => item.part === "state");

			expect(entry?.reason).toContain("state file");
		});

		test("is complete once the state file is supplied", () => {
			expect(receive({ state: { utxos: [] } }).missing).toEqual([]);
		});
	});
});
