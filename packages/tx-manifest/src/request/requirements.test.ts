import { describe, expect, test } from "bun:test";

import p2pkManifest from "../__fixtures__/p2pk.manifest.json";
import { findAction, normaliseManifest } from "../document/normalise";
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

/**
 * The same question asked of the published manifest.
 *
 * The action is found before it is asked about, because a name that matches nothing is a
 * different answer from an action that needs something: which of the two declaration shapes
 * holds it is the normalisation layer's business, and it is settled before this is asked.
 */
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

/**
 * A deployment's field values are asked for when the action actually reads them, and not because
 * of where the action was declared.
 *
 * A method belongs to a class, but belonging is not reading: a method whose covenant is wired
 * entirely to its own parameters has nothing to look up, and demanding a file for it sends a site
 * looking for something the document never asked it to send.
 */
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

	/**
	 * The spelling the corpus writes most: a bare name, which means the request's own parameter
	 * where the request supplied one and the deployment's field where it did not.
	 */
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

	/**
	 * The same position also carries bare values — a count, or one of the two words a flag is
	 * written as — and `false` is a perfectly well-formed name. Only the document can tell them
	 * apart, by whether the class declares a field of that name.
	 */
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

	/**
	 * A constructor names the deployment it is in the middle of writing.
	 *
	 * It works out a covenant hash, then wires the covenant it creates to that field. The spelling
	 * is `instance.HASH` — an explicit reading of a deployment — but the deployment it reads is the
	 * one this very action produces, and no earlier file could have held it. Asking for one demands
	 * a value only this wallet can make.
	 */
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

	/** The deprecated spelling of the same reading is subtracted the same way. */
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

	/** A field the constructor does not create is still a real read of an earlier deployment. */
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

	/**
	 * A free action has no class and therefore no deployment. This is a document that cannot be
	 * satisfied rather than a request that is short a file — sending one would not answer it — so
	 * it is named as a fault instead of asked for.
	 */
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
