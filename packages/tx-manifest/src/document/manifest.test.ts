import { describe, expect, test } from "bun:test";

import p2pk from "../__fixtures__/p2pk/txmanifest.json";
import vaultlet from "../__fixtures__/vaultlet/txmanifest.json";
import { refusalOf } from "../review/reviewForTests";
import { Manifest } from "./manifest";

const VAULTLET = Manifest.parse(vaultlet as unknown as Record<string, unknown>);

const parsed = (document: Record<string, unknown>) =>
	Manifest.parse({ manifest_version: "0.3.1", ...document });

describe("a manifest's actions", () => {
	test("inside a template are bound to the template", () => {
		expect(VAULTLET.action("Withdraw")?.template).toBe("vaultlet_contract");
	});

	test("are constructors exactly where they create an instance", () => {
		expect(VAULTLET.action("OpenVault")?.create_instance).toBeDefined();
		expect(VAULTLET.action("Withdraw")?.create_instance).toBeUndefined();
	});

	test("read the fields their template declares", () => {
		expect(Object.keys(VAULTLET.templateFields(VAULTLET.action("Withdraw")!))).toEqual([
			"OWNER_PUB_KEY",
			"VAULT_ASSET_ID",
			"VAULT_AMOUNT",
			"TIMEOUT",
			"RESERVE_COV_HASH",
			"GUARD_COV_HASH",
		]);
	});

	test("at the top level belong to no template", () => {
		const manifest = Manifest.parse(p2pk as unknown as Record<string, unknown>);
		const action = manifest.action("Pay")!;

		expect(action.template).toBeUndefined();
		expect(manifest.templateFields(action)).toEqual({});
	});

	test("label an input or output by its id, or by its place where it has none", () => {
		const action = parsed({
			actions: {
				Act: { outputs: [{ destination: "wallet" }, { destination: "change", id: "c" }] },
			},
		}).action("Act")!;

		expect(action.outputs.map((output) => output.label)).toEqual(["#1", "c"]);
	});
});

describe("the build mode", () => {
	test("includes debug symbols where simplicity_hl asks for them", () => {
		expect(parsed({ simplicity_hl: { debug_symbols: true } }).includeDebugSymbols).toBe(true);
	});

	test("cannot be read from a value that is neither on nor off", () => {
		const refusal = refusalOf(() => parsed({ simplicity_hl: { debug_symbols: "yes" } }));

		expect(refusal.reject).toBe("unreadable-build-mode");
	});
});

describe("what a manifest is refused for before its shape is read", () => {
	test("a format other than 0.3", () => {
		expect(refusalOf(() => Manifest.parse({ manifest_version: "0.2.0" })).reject).toBe(
			"foreign-format",
		);
	});

	test("a chain this wallet does not build on", () => {
		expect(refusalOf(() => parsed({ chain: "bitcoin" })).reject).toBe("foreign-chain");
	});
});

describe("a manifest whose shape is not the format's", () => {
	test("is refused naming where", () => {
		const refusal = refusalOf(() =>
			parsed({ actions: { Act: { inputs: [{ utxo_source: "wallet", witnesses: ["S"] }] } } }),
		);

		expect(refusal.reject).toBe("document-fault");
		expect(refusal.reason).toContain("actions / Act / inputs / 0 / witnesses");
	});

	test("names an unstable compiler feature the format does not have", () => {
		expect(
			refusalOf(() => parsed({ simplicity_hl: { unstable_features: ["macros"] } })).reason,
		).toContain("unstable_features");
	});

	test("accepts the unstable features it does have, which this wallet always compiles with", () => {
		expect(() =>
			parsed({ simplicity_hl: { unstable_features: ["enums", "imports"] } }),
		).not.toThrow();
	});
});
