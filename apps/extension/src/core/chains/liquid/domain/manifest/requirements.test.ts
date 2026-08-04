import { describe, expect, test } from "bun:test";

import groupedManifest from "./__fixtures__/p2pk-grouped.manifest.json";
import p2pkManifest from "./__fixtures__/p2pk.manifest.json";
import { normaliseManifest } from "./normalise";
import { resolveActionRequirements } from "./requirements";
import type { ParsedLiquidProcessCtParams } from "./types";

// The fixture is the published p2pk manifest at txmanifest-wallet
// 7d56516a1a1e44a586f25d45a34619c3953758dd, unmodified. Expectations below come from
// what that document says an action needs, not from what the resolver happens to return.

const SOURCE_PATH = "./p2pk.simf";
const PUBKEY = "0".repeat(64);
const MANIFEST = normaliseManifest(p2pkManifest as unknown as Record<string, unknown>).manifest;

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

/** The same question asked of the published manifest, normalised once. */
function requirements(overrides: Partial<ParsedLiquidProcessCtParams> = {}) {
	return resolveActionRequirements(request(overrides), MANIFEST);
}

describe("resolveActionRequirements", () => {
	test("refuses an action the manifest does not declare, naming it", () => {
		const { missing } = requirements({ action: "Withdraw" });

		expect(missing).toHaveLength(1);
		expect(missing[0]?.reason).toContain("Withdraw");
	});

	// Pay locks funds into a new p2pk output: one wallet input, a covenant destination.
	// It reads no deployment state, so a request without instance or state is complete.
	describe("Pay", () => {
		test("needs the contract source and the declared parameters", () => {
			const { required } = requirements();

			expect(required).toContain("contractSources");
			expect(required).toContain("params");
		});

		test("does not need the instance or state files", () => {
			const { required } = requirements();

			expect(required).not.toContain("instance");
			expect(required).not.toContain("state");
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

// AC-10 at this seam: the grouped twin of the published manifest must be answered
// identically, so nothing downstream can behave differently on one of the two shapes.
describe("resolveActionRequirements across declaration shapes", () => {
	const GROUPED = normaliseManifest(groupedManifest as unknown as Record<string, unknown>).manifest;

	for (const action of ["Pay", "Receive"]) {
		test(`answers ${action} the same for a grouped manifest as for a flat one`, () => {
			const params = { amount_sat: 1000, pubkey: PUBKEY };
			const flat = resolveActionRequirements(request({ action, params }), MANIFEST);
			const grouped = resolveActionRequirements(request({ action, params }), GROUPED);

			expect(grouped).toEqual(flat);
		});
	}
});

// The reference implementation's own comment calls a param's `formula` informational only
// for display and never evaluates it, so a parameter carrying one is still one the request
// has to fill. Treating it as derived accepts a short request and fails later.
describe("which parameters the request must fill", () => {
	function paramsOf(declared: Record<string, unknown>) {
		const manifest = normaliseManifest({
			actions: { Open: { params: declared } },
		}).manifest;

		return resolveActionRequirements(
			request({ action: "Open", contractSources: {}, params: {} }),
			manifest,
		);
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

// The normalised shape keeps which class a method belongs to because only a method has a
// deployment to read. That distinction has to do work, or it is a field with no reader.
describe("which actions can read a deployment", () => {
	const reader = { destination: { compile_params: { OWNER: "instance.OWNER" }, utxo_type: "v" } };
	const utxo_types = { v: { script: { source: "./v.simf" } } };

	function ask(raw: Record<string, unknown>, action: string) {
		return resolveActionRequirements(
			request({ action, contractSources: { "./v.simf": "fn main() {}" }, params: {} }),
			normaliseManifest(raw).manifest,
		);
	}

	test("a method inside a class needs the instance file", () => {
		const { missing, required } = ask(
			{ classes: { Vault: { methods: { Open: { outputs: [reader] } } } }, utxo_types },
			"Open",
		);

		expect(required).toContain("instance");
		expect(missing.find((entry) => entry.part === "instance")?.reason).toContain(
			"deployment's field values",
		);
	});

	test("the same method is satisfied once the instance file is supplied", () => {
		const manifest = normaliseManifest({
			classes: { Vault: { methods: { Open: { outputs: [reader] } } } },
			utxo_types,
		}).manifest;
		const { missing } = resolveActionRequirements(
			request({
				action: "Open",
				contractSources: { "./v.simf": "fn main() {}" },
				instance: { instance: { fields: { OWNER: "0x01" } } },
				params: {},
			}),
			manifest,
		);

		expect(missing).toEqual([]);
	});

	// A free action reaching for a deployment cannot be satisfied by any request, so the
	// refusal names the document's fault rather than asking for a file that would not help.
	test("a free action reading a deployment is refused as a fault in the manifest", () => {
		const { missing } = ask({ actions: { Open: { outputs: [reader] } }, utxo_types }, "Open");
		const entry = missing.find((part) => part.part === "instance");

		expect(entry?.reason).toContain("not declared inside a class");
		expect(entry?.keys).toContain("action Open / output (unnamed) / OWNER");
	});
});
