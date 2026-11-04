import { describe, expect, test } from "bun:test";

import p2pk from "../__fixtures__/p2pk/txmanifest.json";
import vaultlet from "../__fixtures__/vaultlet/txmanifest.json";
import { declaredFields, findAction, normaliseInstance, normaliseManifest } from "./normalise";

const VAULTLET = normaliseManifest(vaultlet as unknown as Record<string, unknown>);

describe("a manifest's actions", () => {
	test("inside a template are bound to the template", () => {
		expect(findAction(VAULTLET, "Withdraw")?.boundTo).toBe("vaultlet_contract");
	});

	test("are constructors exactly where they create an instance", () => {
		expect(findAction(VAULTLET, "OpenVault")?.isConstructor).toBe(true);
		expect(findAction(VAULTLET, "Withdraw")?.isConstructor).toBe(false);
	});

	test("read the fields their template declares", () => {
		expect(Object.keys(declaredFields(VAULTLET, findAction(VAULTLET, "Withdraw")!))).toEqual([
			"OWNER_PUB_KEY",
			"VAULT_ASSET_ID",
			"VAULT_AMOUNT",
			"TIMEOUT",
			"RESERVE_COV_HASH",
			"GUARD_COV_HASH",
		]);
	});

	test("at the top level belong to no template", () => {
		const manifest = normaliseManifest(p2pk as unknown as Record<string, unknown>);
		const action = findAction(manifest, "Pay")!;

		expect(action.boundTo).toBeUndefined();
		expect(declaredFields(manifest, action)).toEqual({});
	});
});

describe("the build mode", () => {
	test("includes debug symbols where simplicity_hl asks for them", () => {
		expect(normaliseManifest({ simplicity_hl: { debug_symbols: true } }).buildMode).toEqual({
			includeDebugSymbols: true,
			ok: true,
		});
	});

	test("cannot be read from a value that is neither on nor off", () => {
		expect(normaliseManifest({ simplicity_hl: { debug_symbols: "yes" } }).buildMode.ok).toBe(false);
	});
});

describe("an instance file", () => {
	test("carries its template, fields and pinned inputs", () => {
		expect(
			normaliseInstance({
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
		expect(normaliseInstance(undefined)).toEqual({ fields: {}, providedInputs: {} });
	});
});
