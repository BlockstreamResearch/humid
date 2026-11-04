import { describe, expect, test } from "bun:test";

import p2pk from "../__fixtures__/p2pk/txmanifest.json";
import vaultlet from "../__fixtures__/vaultlet/txmanifest.json";
import { refusalOf } from "../review/reviewForTests";
import { readInstance, Manifest } from "./manifest";

const VAULTLET = new Manifest(vaultlet as unknown as Record<string, unknown>);

describe("a manifest's actions", () => {
	test("inside a template are bound to the template", () => {
		expect(VAULTLET.action("Withdraw")?.boundTo).toBe("vaultlet_contract");
	});

	test("are constructors exactly where they create an instance", () => {
		expect(VAULTLET.action("OpenVault")?.isConstructor).toBe(true);
		expect(VAULTLET.action("Withdraw")?.isConstructor).toBe(false);
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
		const manifest = new Manifest(p2pk as unknown as Record<string, unknown>);
		const action = manifest.action("Pay")!;

		expect(action.boundTo).toBeUndefined();
		expect(manifest.templateFields(action)).toEqual({});
	});
});

describe("the build mode", () => {
	test("includes debug symbols where simplicity_hl asks for them", () => {
		expect(new Manifest({ simplicity_hl: { debug_symbols: true } }).includeDebugSymbols).toBe(true);
	});

	test("cannot be read from a value that is neither on nor off", () => {
		const manifest = new Manifest({ simplicity_hl: { debug_symbols: "yes" } });

		expect(refusalOf(() => manifest.includeDebugSymbols).reject).toBe("unreadable-build-mode");
	});
});

describe("an instance file", () => {
	test("carries its template, fields and pinned inputs", () => {
		expect(
			readInstance({
				instance: { fields: { TIMEOUT: "900000" }, template: "vaultlet_contract" },
				provided_inputs: { vault_in: { txid: "a".repeat(64), vout: 0 } },
			}),
		).toEqual({
			fields: { TIMEOUT: "900000" },
			providedInputs: { vault_in: { txid: "a".repeat(64), vout: 0 } },
			template: "vaultlet_contract",
		});
	});

	test("is empty where none was supplied", () => {
		expect(readInstance(undefined)).toEqual({ fields: {}, providedInputs: {} });
	});
});
