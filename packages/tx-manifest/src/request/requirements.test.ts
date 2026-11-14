import { describe, expect, test } from "bun:test";

import p2pkManifest from "../__fixtures__/p2pk/txmanifest.json";
import { Manifest } from "../document/manifest";
import type { ParsedLiquidProcessCtParams, RequestPart } from "./request";
import { missingParts } from "./requirements";

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
	const manifest = new Manifest(asked.manifest);
	const action = manifest.action(asked.action);

	if (!action) {
		throw new Error(`This manifest declares no action named ${asked.action}.`);
	}

	return missingParts(asked, manifest, action);
}

function parts(overrides: Partial<ParsedLiquidProcessCtParams> = {}): RequestPart[] {
	return requirements(overrides).map((missing) => missing.part);
}

describe("missingParts", () => {
	test("an action the manifest does not declare is not one to ask about", () => {
		const manifest = new Manifest(MANIFEST);

		expect(manifest.action("Withdraw")).toBeUndefined();
	});

	describe("Pay", () => {
		test("needs the contract source and the declared parameters", () => {
			expect(parts({ contractSources: {}, params: {} })).toEqual(["contractSources", "params"]);
		});

		test("does not need the state file", () => {
			expect(parts()).not.toContain("state");
		});

		test("is complete when the source and parameters are supplied", () => {
			expect(requirements()).toEqual([]);
		});

		test("names the contract source that was not supplied", () => {
			const entry = requirements({ contractSources: {} }).find(
				(item) => item.part === "contractSources",
			);

			expect(entry?.keys).toEqual([SOURCE_PATH]);
		});

		test("names each parameter the request did not fill", () => {
			const entry = requirements({ params: { pubkey: PUBKEY } }).find(
				(item) => item.part === "params",
			);

			expect(entry?.keys).toEqual(["amount_sat"]);
		});
	});

	describe("Receive", () => {
		const receive = (overrides: Partial<ParsedLiquidProcessCtParams> = {}) =>
			requirements({ action: "Receive", params: { pubkey: PUBKEY }, ...overrides });

		test("refuses without the state file, saying why", () => {
			const entry = receive().find((item) => item.part === "state");

			expect(entry?.reason).toContain("state file");
		});

		test("is complete once the state file is supplied", () => {
			expect(receive({ state: { utxos: [] } })).toEqual([]);
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

	test("a parameter the wallet supplies is not", () => {
		expect(
			paramsOf({ key: { compute: { type: "wallet", wallet: "key" }, type: "pubkey" } }),
		).toEqual([]);
	});

	test("a computed parameter is not", () => {
		expect(paramsOf({ hash: { compute: { simf: "./a.simf", type: "tapleaf" } } })).toEqual([]);
	});
});

describe("wallet inputs and program inputs", () => {
	function ask(action: Record<string, unknown>) {
		return parts({
			action: "Open",
			contractSources: {},
			manifest: {
				actions: { Open: action },
				utxo_types: { v: { script: { source: SOURCE_PATH } } },
			},
			params: {},
		});
	}

	test("a wallet-funded input needs no state file", () => {
		expect(ask({ inputs: [{ id: "funding", utxo_source: "wallet" }] })).not.toContain("state");
	});

	test("an input spent from a program does", () => {
		expect(ask({ inputs: [{ id: "held", utxo_source: { utxo_type: "v" } }] })).toContain("state");
	});

	test("creating a program does not, because there is nothing yet to locate", () => {
		expect(ask({ outputs: [{ destination: { utxo_type: "v" }, id: "made" }] })).not.toContain(
			"state",
		);
	});

	test("a program an output creates still needs its contract source", () => {
		expect(ask({ outputs: [{ destination: { utxo_type: "v" }, id: "made" }] })).toContain(
			"contractSources",
		);
	});
});

describe("when a deployment's field values are needed", () => {
	const TEMPLATE_FIELDS = {
		OWNER_PUB_KEY: { type: "pubkey" },
		TIMEOUT: { type: "u32" },
	};

	function templateAction(method: Record<string, unknown>, params: Record<string, unknown> = {}) {
		return requirements({
			action: "Act",
			contractSources: { [SOURCE_PATH]: "fn main() {}" },
			manifest: {
				contract_templates: { thing: { actions: { Act: method }, fields: TEMPLATE_FIELDS } },
				utxo_types: { v: { script: { source: SOURCE_PATH } } },
			},
			params,
		});
	}

	function instanceMissing(
		method: Record<string, unknown>,
		params: Record<string, unknown> = {},
	): boolean {
		return templateAction(method, params).some((missing) => missing.part === "instance");
	}

	test("an action reading nothing off the deployment needs no instance file", () => {
		const missing = templateAction({
			outputs: [
				{
					amount_sat: "params.amount_sat",
					destination: { compile_params: { OWNER_PUB_KEY: "params.key" }, utxo_type: "v" },
					id: "out",
				},
			],
		});

		expect(missing).toEqual([]);
	});

	test("an action naming the deployment outright does", () => {
		const missing = templateAction({
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

		expect(missing.find((entry) => entry.part === "instance")?.keys).toEqual([
			"action Act / output out / OWNER_PUB_KEY",
		]);
	});

	test("a bare name the template declares as a field does, unless the request filled the field", () => {
		const wiring = {
			outputs: [
				{
					amount_sat: "1000",
					destination: { compile_params: { OWNER_PUB_KEY: "OWNER_PUB_KEY" }, utxo_type: "v" },
					id: "out",
				},
			],
		};

		expect(instanceMissing(wiring)).toBe(true);
		expect(instanceMissing(wiring, { OWNER_PUB_KEY: PUBKEY })).toBe(false);
	});

	test("a bare value at the same position does not, however name-shaped it looks", () => {
		const missing = templateAction({
			outputs: [
				{
					amount_sat: "1000",
					destination: { compile_params: { SLOT_COUNT: "2", WITH_BURN: "false" }, utxo_type: "v" },
					id: "out",
				},
			],
		});

		expect(missing).toEqual([]);
	});

	test("an amount read off the deployment needs it too", () => {
		expect(
			instanceMissing({
				outputs: [{ amount_sat: "instance.TIMEOUT", destination: "wallet", id: "out" }],
			}),
		).toBe(true);
	});

	test("a constructor reading a field its own create_instance produces needs no instance file", () => {
		const missing = templateAction(
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

		expect(missing).toEqual([]);
	});

	test("an action reading its own parameter as a field needs no instance file", () => {
		expect(
			instanceMissing(
				{
					outputs: [{ amount_sat: "instance.tip", destination: "wallet", id: "out" }],
					params: { tip: { type: "u64" } },
				},
				{ tip: 1 },
			),
		).toBe(false);
	});

	test("but a field its create_instance does not produce is still read from one", () => {
		const missing = instanceMissing({
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

		expect(missing).toBe(true);
	});

	test("a free action reading a deployment's field is satisfied by a value the request supplies", () => {
		expect(
			requirements({
				action: "Free",
				contractSources: { [SOURCE_PATH]: "fn main() {}" },
				manifest: {
					actions: {
						Free: {
							outputs: [{ amount_sat: "instance.AMOUNT", destination: "wallet", id: "out" }],
						},
					},
				},
				params: { AMOUNT: "1" },
			}),
		).toEqual([]);
	});

	test("a free action reading a deployment is unsatisfiable rather than short a file", () => {
		const missing = requirements({
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

		expect(missing.find((entry) => entry.part === "instance")?.reason).toContain(
			"declared outside any template",
		);
	});
});
