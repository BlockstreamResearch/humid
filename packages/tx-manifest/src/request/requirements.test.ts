import { describe, expect, test } from "bun:test";

import p2pkManifest from "../__fixtures__/p2pk.manifest.json";
import type { ParsedLiquidProcessCtParams } from "./request";
import { resolveActionRequirements } from "./requirements";

// The fixture is the published p2pk manifest at txmanifest-wallet
// 7d56516a1a1e44a586f25d45a34619c3953758dd, unmodified. Expectations below come from
// what that document says an action needs, not from what the resolver happens to return.

const SOURCE_PATH = "./p2pk.simf";
const PUBKEY = "0".repeat(64);
const MANIFEST = p2pkManifest as unknown as Record<string, unknown>;

function request(
	overrides: Partial<ParsedLiquidProcessCtParams> = {},
): ParsedLiquidProcessCtParams {
	return {
		action: "Pay",
		broadcast: false,
		contractSources: { [SOURCE_PATH]: "fn main() {}" },
		manifest: MANIFEST,
		params: { amount_sat: 1000, pubkey: PUBKEY },
		...overrides,
	};
}

/** The same question asked of the published manifest. */
function requirements(overrides: Partial<ParsedLiquidProcessCtParams> = {}) {
	return resolveActionRequirements(request(overrides));
}

describe("resolveActionRequirements", () => {
	test("refuses an action the manifest does not declare, naming it", () => {
		const { missing } = requirements({ action: "Withdraw" });

		expect(missing).toHaveLength(1);
		expect(missing[0]?.reason).toContain("Withdraw");
	});

	// Pay locks funds into a new p2pk output: one wallet input, a covenant destination.
	// It spends no covenant, so a request without the state file is complete.
	describe("Pay", () => {
		test("needs the contract source and the declared parameters", () => {
			const { required } = requirements();

			expect(required).toContain("contractSources");
			expect(required).toContain("params");
		});

		test("does not need the state file", () => {
			expect(requirements().required).not.toContain("state");
		});

		test("is complete when the source and parameters are supplied", () => {
			expect(requirements().missing).toEqual([]);
		});

		test("names the contract source that was not supplied", () => {
			const { missing } = requirements({ contractSources: {} });
			const entry = missing.find((item) => item.part === "contractSources");

			expect(entry?.keys).toEqual([SOURCE_PATH]);
		});

		test("names each parameter the request did not fill", () => {
			const { missing } = requirements({ params: { pubkey: PUBKEY } });
			const entry = missing.find((item) => item.part === "params");

			expect(entry?.keys).toEqual(["amount_sat"]);
		});
	});

	// Receive spends the covenant UTXO, which the manifest locates by utxo_type — a lookup
	// into the state file rather than into the chain.
	describe("Receive", () => {
		const receive = (overrides: Partial<ParsedLiquidProcessCtParams> = {}) =>
			requirements({ action: "Receive", params: { pubkey: PUBKEY }, ...overrides });

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

// The reference implementation's own comment calls a param's `formula` informational only
// for display and never evaluates it, so a parameter carrying one is still one the request
// has to fill. Treating it as derived accepts a short request and fails later.
describe("which parameters the request must fill", () => {
	function paramsOf(declared: Record<string, unknown>) {
		return requirements({
			action: "Open",
			contractSources: {},
			manifest: { actions: { Open: { params: declared } } },
			params: {},
		});
	}

	test("a parameter with a display formula is still prompted for", () => {
		const { missing } = paramsOf({ total: { formula: "a + b", type: "u64" } });

		expect(missing.find((entry) => entry.part === "params")?.keys).toEqual(["total"]);
	});

	test("a parameter the wallet supplies is not", () => {
		const { missing } = paramsOf({ key: { source: { type: "wallet_key" }, type: "pubkey" } });

		expect(missing).toEqual([]);
	});

	test("a computed parameter is not", () => {
		const { missing } = paramsOf({ hash: { compute: "tapleaf", simf: "./a.simf" } });

		expect(missing).toEqual([]);
	});
});

// An input sourced from the wallet names no covenant, and an output that creates one names
// a covenant that does not exist yet. Neither is a lookup into the state file, and reading
// either as one would ask a site for a file that could not answer.
describe("wallet inputs and covenant inputs", () => {
	function ask(action: Record<string, unknown>) {
		return requirements({
			action: "Open",
			manifest: {
				actions: { Open: action },
				utxo_types: { v: { script: { source: SOURCE_PATH } } },
			},
			params: {},
		});
	}

	test("a wallet-funded input needs no state file", () => {
		expect(ask({ inputs: [{ id: "funding", utxo_source: "wallet" }] }).required).not.toContain(
			"state",
		);
	});

	test("an input spent from a covenant does", () => {
		expect(ask({ inputs: [{ id: "held", utxo_source: { utxo_type: "v" } }] }).required).toContain(
			"state",
		);
	});

	test("creating a covenant does not, because there is nothing yet to locate", () => {
		expect(
			ask({ outputs: [{ destination: { utxo_type: "v" }, id: "made" }] }).required,
		).not.toContain("state");
	});

	test("a covenant an output creates still needs its contract source", () => {
		const { required } = ask({ outputs: [{ destination: { utxo_type: "v" }, id: "made" }] });

		expect(required).toContain("contractSources");
	});
});
