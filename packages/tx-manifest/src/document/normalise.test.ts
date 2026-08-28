import { describe, expect, test } from "bun:test";

import groupedManifest from "../__fixtures__/p2pk-grouped.manifest.json";
import flatManifest from "../__fixtures__/p2pk.manifest.json";
import { findAction, normaliseInstance, normaliseManifest } from "./normalise";

// The flat fixture is the published p2pk manifest at txmanifest-wallet
// 7d56516a1a1e44a586f25d45a34619c3953758dd, unmodified. The grouped one is the same
// protocol written in the older spellings — grouped classes and `compose_version` —
// and is ours, because no legacy twin of a published manifest exists to compare against.
// What the pair proves is therefore that the two spellings converge, not that any real
// third-party document does.

const flat = flatManifest as unknown as Record<string, unknown>;
const grouped = groupedManifest as unknown as Record<string, unknown>;

describe("normaliseManifest", () => {
	describe("declaration shapes", () => {
		test("reads a flat manifest's actions", () => {
			const { manifest } = normaliseManifest(flat);

			expect(manifest.actions.map((action) => action.name)).toEqual(["Pay", "Receive"]);
		});

		test("reads a grouped manifest's methods as the same actions", () => {
			const { manifest } = normaliseManifest(grouped);

			expect(manifest.actions.map((action) => action.name)).toEqual(["Pay", "Receive"]);
		});

		test("keeps which class a method belongs to, because only a method reads an instance file", () => {
			const { manifest } = normaliseManifest(grouped);

			expect(manifest.actions.map((action) => action.boundTo)).toEqual(["P2pk", "P2pk"]);
		});

		test("a free action is bound to nothing", () => {
			const { manifest } = normaliseManifest(flat);

			expect(manifest.actions.every((action) => action.boundTo === undefined)).toBe(true);
		});

		// AC-10, declaration-shape half: equivalent documents in the two shapes produce the
		// same action, so nothing downstream can behave differently on one of them.
		test("both shapes produce identical actions", () => {
			const fromFlat = normaliseManifest(flat).manifest.actions;
			const fromGrouped = normaliseManifest(grouped).manifest.actions;

			expect(fromGrouped.map(({ boundTo: _boundTo, ...rest }) => rest)).toEqual(
				fromFlat.map(({ boundTo: _boundTo, ...rest }) => rest),
			);
		});
	});

	describe("legacy spellings", () => {
		test("accepts compose_version for manifest_version", () => {
			expect(normaliseManifest(grouped).manifest.manifestVersion).toBe("0.1.0");
		});

		test("records what it renamed rather than renaming silently", () => {
			const { notes } = normaliseManifest(grouped);

			expect(notes).toContainEqual({
				at: "manifest",
				canonical: "manifest_version",
				found: "compose_version",
			});
		});

		test("accepts deploy for is_constructor", () => {
			const { manifest } = normaliseManifest({
				actions: { Open: { deploy: true } },
			});

			expect(manifest.actions[0]?.isConstructor).toBe(true);
		});

		test("lifts the legacy hooks block onto the action", () => {
			const { manifest } = normaliseManifest({
				actions: { Open: { hooks: { on_validate: "fn main() {}" } } },
			});

			expect(manifest.actions[0]?.node.on_validate).toBe("fn main() {}");
			expect(manifest.actions[0]?.node.hooks).toBeUndefined();
		});

		test("flattens the nested compile_params block into params", () => {
			const { manifest } = normaliseManifest({
				compile_params: { derived: { COV_HASH: "0x00" }, user_provided: { OWNER: "0x01" } },
			});

			expect(manifest.params).toEqual({ COV_HASH: "0x00", OWNER: "0x01" });
		});

		test("accepts lang for compute on a param", () => {
			const { manifest } = normaliseManifest({
				actions: { Open: { params: { hash: { lang: "tapleaf", simf: "./a.simf" } } } },
			});

			const params = manifest.actions[0]?.node.params as Record<string, Record<string, unknown>>;

			expect(params.hash?.compute).toBe("tapleaf");
			expect(params.hash?.lang).toBeUndefined();
		});

		// The wiring map on a script, an input or an output is also called `compile_params`,
		// and it is not the deprecated namespace. Renaming by key alone would rewrite it.
		test("leaves a compile_params wiring map alone", () => {
			const { manifest } = normaliseManifest({
				actions: {
					Open: {
						outputs: [
							{ destination: { compile_params: { PUB_KEY: "params.pubkey" }, utxo_type: "vault" } },
						],
					},
				},
			});

			const outputs = manifest.actions[0]?.node.outputs as Record<string, unknown>[];
			const destination = outputs[0]?.destination as Record<string, unknown>;

			expect(destination.compile_params).toEqual({ PUB_KEY: "params.pubkey" });
		});
	});

	describe("what it does not do", () => {
		test("an unknown top-level field survives into the document untouched", () => {
			const { manifest } = normaliseManifest({ lifecycle: { stages: ["open"] } });

			expect(manifest.raw.lifecycle).toEqual({ stages: ["open"] });
		});

		test("a manifest declaring nothing normalises to an empty document rather than throwing", () => {
			const { manifest, notes } = normaliseManifest({});

			expect(manifest.actions).toEqual([]);
			expect(notes).toEqual([]);
		});
	});
});

describe("findAction", () => {
	test("finds a flat action by name", () => {
		expect(findAction(normaliseManifest(flat).manifest, "Receive")?.name).toBe("Receive");
	});

	test("finds a grouped method by the same name", () => {
		expect(findAction(normaliseManifest(grouped).manifest, "Receive")?.boundTo).toBe("P2pk");
	});

	test("returns nothing for a name the manifest does not declare", () => {
		expect(findAction(normaliseManifest(flat).manifest, "Withdraw")).toBeUndefined();
	});
});

describe("normaliseInstance", () => {
	test("reads the current shape", () => {
		const { instance } = normaliseInstance({
			instance: { class: "Vault", fields: { OWNER: "0x01" } },
		});

		expect(instance).toEqual({ className: "Vault", fields: { OWNER: "0x01" } });
	});

	test("accepts the legacy flat instance_params map", () => {
		const { instance } = normaliseInstance({ instance_params: { OWNER: "0x01" } });

		expect(instance.fields).toEqual({ OWNER: "0x01" });
	});

	test("records that it read the legacy spelling", () => {
		const { notes } = normaliseInstance({ instance_params: { OWNER: "0x01" } });

		expect(notes).toContainEqual({
			at: "instance",
			canonical: "instance.fields",
			found: "instance_params",
		});
	});

	test("prefers the current spelling when a file carries both", () => {
		const { instance } = normaliseInstance({
			instance: { fields: { OWNER: "0x02" } },
			instance_params: { OWNER: "0x01" },
		});

		expect(instance.fields).toEqual({ OWNER: "0x02" });
	});
});
