import { describe, expect, test } from "bun:test";

import currentVaultlet from "../__fixtures__/current/vaultlet.manifest.json";
import p2pkManifest from "../__fixtures__/p2pk.manifest.json";
import groupedVaultlet from "../__fixtures__/vaultlet.manifest.json";
import { declaredFields, findAction, normaliseInstance, normaliseManifest } from "./normalise";

/**
 * One document, two generations, one reading.
 *
 * The corpus renamed a container and both halves of it at once — `classes.methods` became
 * `contract_templates.actions` — and the same protocol is published in both. A wallet that read
 * one would be as blind to the other generation as it was to this one, and the money the older
 * documents locate is demonstrably on chain. So the two normalise to one shape, and every test
 * below that names one spelling asserts the other produces the same answer.
 */

const GROUPED = groupedVaultlet as unknown as Record<string, unknown>;
const CURRENT = currentVaultlet as unknown as Record<string, unknown>;

describe("the two container generations", () => {
	test("declare the same actions under both spellings", () => {
		const grouped = normaliseManifest(GROUPED).manifest.actions.map((action) => action.name);
		const current = normaliseManifest(CURRENT).manifest.actions.map((action) => action.name);

		expect(grouped).toEqual(["OpenVault", "Withdraw"]);
		expect(current).toEqual(grouped);
	});

	test("bind each method to the class that holds it", () => {
		for (const document of [GROUPED, CURRENT]) {
			const manifest = normaliseManifest(document).manifest;

			expect(findAction(manifest, "Withdraw")?.boundTo).toBe("vaultlet_contract");
		}
	});

	test("mark the constructor under either spelling of the flag", () => {
		for (const document of [GROUPED, CURRENT]) {
			const manifest = normaliseManifest(document).manifest;

			expect(findAction(manifest, "OpenVault")?.isConstructor).toBe(true);
			expect(findAction(manifest, "Withdraw")?.isConstructor).toBe(false);
		}
	});

	/**
	 * The class is where a deployment's field types are stated — there is nowhere else — and it is
	 * reached through the same container list the actions were found through. A reader that looked
	 * for one name would find the fields of half the corpus.
	 */
	test("reach the same declared fields from a method in either", () => {
		for (const document of [GROUPED, CURRENT]) {
			const manifest = normaliseManifest(document).manifest;
			const action = findAction(manifest, "Withdraw");

			expect(Object.keys(declaredFields(manifest, action!))).toEqual([
				"OWNER_PUB_KEY",
				"VAULT_ASSET_ID",
				"VAULT_AMOUNT",
				"TIMEOUT",
				"RESERVE_COV_HASH",
				"GUARD_COV_HASH",
			]);
		}
	});

	/**
	 * A rewrite is never silent. Both documents are rewritten — one's flag, the other's container
	 * — and each records what it was found under, so a reader can say which generation a document
	 * came from without the value it produced depending on the answer.
	 */
	test("record the spelling each document was written in", () => {
		expect(normaliseManifest(GROUPED).notes).toEqual([
			{ at: "action OpenVault", canonical: "is_constructor", found: "deploy" },
		]);
		expect(normaliseManifest(CURRENT).notes).toEqual([
			{ at: "container vaultlet_contract", canonical: "classes", found: "contract_templates" },
		]);
	});
});

describe("an action declared at the top level", () => {
	test("belongs to no class and therefore to no deployment", () => {
		const manifest = normaliseManifest(p2pkManifest as unknown as Record<string, unknown>).manifest;
		const action = findAction(manifest, "Pay");

		expect(action?.boundTo).toBeUndefined();
		expect(declaredFields(manifest, action!)).toEqual({});
	});
});

describe("a deployment's field values", () => {
	test("are read from the nested shape a current tool writes", () => {
		const { instance } = normaliseInstance({
			instance: { class: "vaultlet_contract", fields: { TIMEOUT: "900000" } },
		});

		expect(instance).toEqual({ className: "vaultlet_contract", fields: { TIMEOUT: "900000" } });
	});

	test("and from the flat legacy map beside it, recording that it was one", () => {
		const { instance, notes } = normaliseInstance({ instance_params: { TIMEOUT: "900000" } });

		expect(instance.fields).toEqual({ TIMEOUT: "900000" });
		expect(notes).toContainEqual({
			at: "instance",
			canonical: "instance.fields",
			found: "instance_params",
		});
	});

	/**
	 * A file carrying both is not a conflict to resolve by merging. The nested form is what a
	 * current tool writes, so it wins outright — layering the legacy map underneath would let a
	 * stale value the newer half replaced come back.
	 */
	test("take the nested shape outright when a file carries both", () => {
		const { instance } = normaliseInstance({
			instance: { fields: { TIMEOUT: "1" } },
			instance_params: { OTHER: "2", TIMEOUT: "2" },
		});

		expect(instance.fields).toEqual({ TIMEOUT: "1" });
	});

	test("are absent, rather than empty of meaning, when no file was supplied", () => {
		expect(normaliseInstance(undefined).instance.fields).toEqual({});
	});

	/**
	 * A file naming a class and no fields has no fields. Reading its top level as the fields
	 * themselves would make a deployment holding one field called `instance` whose value is an
	 * object — which resolves, encodes as nothing, and refuses somewhere further on for a reason
	 * about the wrong thing.
	 */
	test("are empty for a file that names its class and writes no fields", () => {
		const { instance } = normaliseInstance({ instance: { class: "vaultlet_contract" } });

		expect(instance).toEqual({ className: "vaultlet_contract", fields: {} });
	});

	test("and empty for a file in neither accepted shape, rather than read off its top level", () => {
		expect(normaliseInstance({ TIMEOUT: "900000" }).instance.fields).toEqual({});
	});
});
