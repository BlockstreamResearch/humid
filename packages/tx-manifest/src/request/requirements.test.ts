import { describe, expect, test } from "bun:test";

import p2pkManifest from "../__fixtures__/p2pk.manifest.json";
import { findAction, normaliseManifest } from "../document/normalise";
import type { ParsedLiquidProcessCtParams } from "./request";
import { resolveActionRequirements } from "./requirements";

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

function requirements(overrides: Partial<ParsedLiquidProcessCtParams> = {}) {
	const asked = request(overrides);
	const { manifest } = normaliseManifest(asked.manifest);
	const action = findAction(manifest, asked.action);

	if (!action) {
		throw new Error(`This manifest declares no action named ${asked.action}.`);
	}

	return resolveActionRequirements(asked, manifest, action);
}

describe("resolveActionRequirements", () => {
	test("an action the manifest does not declare is not one to ask about", () => {
		const { manifest } = normaliseManifest(MANIFEST);

		expect(findAction(manifest, "Withdraw")).toBeUndefined();
	});

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

describe("when a deployment's field values are needed", () => {
	const CLASS_FIELDS = {
		OWNER_PUB_KEY: { type: "pubkey" },
		TIMEOUT: { type: "u32" },
	};

	function classMethod(method: Record<string, unknown>, params: Record<string, unknown> = {}) {
		return requirements({
			action: "Act",
			contractSources: { [SOURCE_PATH]: "fn main() {}" },
			manifest: {
				classes: { thing: { fields: CLASS_FIELDS, methods: { Act: method } } },
				utxo_types: { v: { script: { source: SOURCE_PATH } } },
			},
			params,
		});
	}

	test("a method reading nothing off the deployment needs no instance file", () => {
		const { missing, required } = classMethod({
			outputs: [
				{
					amount_sat: "params.amount_sat",
					destination: { compile_params: { OWNER_PUB_KEY: "params.key" }, utxo_type: "v" },
					id: "out",
				},
			],
		});

		expect(required).not.toContain("instance");
		expect(missing).toEqual([]);
	});

	test("a method naming the deployment outright does", () => {
		const { missing, required } = classMethod({
			outputs: [
				{
					amount_sat: "1000",
					destination: {
						compile_params: { OWNER_PUB_KEY: "instance.OWNER_PUB_KEY" },
						utxo_type: "v",
					},
					id: "out",
				},
			],
		});

		expect(required).toContain("instance");
		expect(missing.find((entry) => entry.part === "instance")?.keys).toEqual([
			"action Act / output out / OWNER_PUB_KEY",
		]);
	});

	test("a bare name the class declares as a field does, unless the request filled it", () => {
		const wiring = {
			outputs: [
				{
					amount_sat: "1000",
					destination: { compile_params: { OWNER_PUB_KEY: "OWNER_PUB_KEY" }, utxo_type: "v" },
					id: "out",
				},
			],
		};

		expect(classMethod(wiring).required).toContain("instance");
		expect(classMethod(wiring, { OWNER_PUB_KEY: PUBKEY }).required).not.toContain("instance");
	});

	test("a bare value at the same position does not, however name-shaped it looks", () => {
		const { missing, required } = classMethod({
			outputs: [
				{
					amount_sat: "1000",
					destination: { compile_params: { SLOT_COUNT: "2", WITH_BURN: "false" }, utxo_type: "v" },
					id: "out",
				},
			],
		});

		expect(required).not.toContain("instance");
		expect(missing).toEqual([]);
	});

	test("an amount read off the deployment needs it too", () => {
		const { required } = classMethod({
			outputs: [{ amount_sat: "instance.TIMEOUT", destination: "wallet", id: "out" }],
		});

		expect(required).toContain("instance");
	});

	test("a constructor reading a field its own create_instance produces needs no instance file", () => {
		const { missing, required } = classMethod(
			{
				create_instance: {
					fields: {
						OWNER_PUB_KEY: "params.OWNER_PUB_KEY",
						RESERVE_HASH: {
							params: { OWNER_PUB_KEY: "OWNER_PUB_KEY" },
							simf: "./r.simf",
							type: "tapleaf",
						},
					},
				},
				outputs: [
					{
						amount_sat: "1000",
						destination: {
							compile_params: { RESERVE_COV_HASH: "instance.RESERVE_HASH" },
							utxo_type: "v",
						},
						id: "out",
					},
				],
			},
			{ OWNER_PUB_KEY: PUBKEY },
		);

		expect(required).not.toContain("instance");
		expect(missing).toEqual([]);
	});

	test("and the same under the deprecated namespace", () => {
		const { required } = classMethod({
			create_instance: { fields: { RESERVE_HASH: { simf: "./r.simf", type: "tapleaf" } } },
			outputs: [
				{
					amount_sat: "1000",
					destination: {
						compile_params: { RESERVE_COV_HASH: "compile_params.RESERVE_HASH" },
						utxo_type: "v",
					},
					id: "out",
				},
			],
		});

		expect(required).not.toContain("instance");
	});

	test("but a field its create_instance does not produce is still read from one", () => {
		const { required } = classMethod({
			create_instance: { fields: { RESERVE_HASH: { simf: "./r.simf", type: "tapleaf" } } },
			outputs: [
				{
					amount_sat: "1000",
					destination: {
						compile_params: { OWNER_PUB_KEY: "instance.OWNER_PUB_KEY" },
						utxo_type: "v",
					},
					id: "out",
				},
			],
		});

		expect(required).toContain("instance");
	});

	test("a free action reading a deployment is unsatisfiable rather than short a file", () => {
		const { missing, required } = requirements({
			action: "Free",
			contractSources: { [SOURCE_PATH]: "fn main() {}" },
			manifest: {
				actions: {
					Free: {
						outputs: [{ amount_sat: "instance.AMOUNT", destination: "wallet", id: "out" }],
					},
				},
			},
			instance: { instance: { fields: { AMOUNT: "1" } } },
			params: {},
		});

		expect(required).not.toContain("instance");
		expect(missing.find((entry) => entry.part === "instance")?.reason).toContain(
			"declared outside any class",
		);
	});
});
