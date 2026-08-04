import { describe, expect, test } from "bun:test";

import flatManifest from "./__fixtures__/p2pk.manifest.json";
import { normaliseManifest } from "./normalise";
import { type ConstructFinding, ignored, inspectConstructs, loadBearing } from "./registry";

// Expectations come from the cross-source construct inventory in the change bundle
// (artifacts/manifest-inventory.md) and from AC-02, not from what the registry happens to
// contain. A construct the format carries and this runtime does not act on is a finding;
// whether that finding refuses is a later slice's question.

const flat = flatManifest as unknown as Record<string, unknown>;

function inspect(raw: Record<string, unknown>): ConstructFinding[] {
	return inspectConstructs(normaliseManifest(raw).manifest);
}

function at(findings: ConstructFinding[], key: string): ConstructFinding | undefined {
	return findings.find((finding) => finding.key === key);
}

describe("inspectConstructs", () => {
	describe("what it reports at all", () => {
		test("says nothing about a construct the runtime acts on", () => {
			expect(at(inspect(flat), "utxo_types")).toBeUndefined();
			expect(at(inspect(flat), "destination")).toBeUndefined();
		});

		test("says nothing about a description, which is text for a person", () => {
			expect(at(inspect(flat), "description")).toBeUndefined();
		});

		test("names where it found something, in the document's own terms", () => {
			const finding = at(inspect(flat), "validations");

			expect(finding?.at).toBe("action Pay");
		});
	});

	// AC-02, decorative half. `attestation_version` appears in three published manifests
	// and is read by no implementation, including the reference one. Ignoring it is
	// correct; ignoring it silently is what the criterion forbids.
	describe("decorative constructs are ignored, and the fact recorded", () => {
		test("reports attestation_version as ignored rather than dropping it", () => {
			const finding = at(inspect(flat), "attestation_version");

			expect(finding).toMatchObject({ at: "manifest", declared: true, loadBearing: false });
		});

		test("ignores an unrecognised key inside a display block", () => {
			const findings = inspect({
				actions: { Pay: { ui: { icon: "vault.svg", label: "Pay" } } },
			});

			expect(at(findings, "icon")).toMatchObject({ declared: false, loadBearing: false });
		});

		test("does not report a display key it knows", () => {
			const findings = inspect({ actions: { Pay: { ui: { label: "Pay" } } } });

			expect(at(findings, "label")).toBeUndefined();
		});

		test("collects the ignored ones for reporting", () => {
			expect(ignored(inspect(flat)).map((finding) => finding.key)).toContain("attestation_version");
		});
	});

	// The refusal itself is ISSUE-021. What this slice owes it is the distinction.
	describe("load-bearing constructs are separated out", () => {
		test("a construct the format declares and this runtime does not implement", () => {
			const finding = at(inspect(flat), "validations");

			expect(finding).toMatchObject({ declared: true, loadBearing: true });
		});

		test("an unrecognised key on an input, where being wrong changes what is spent", () => {
			const findings = inspect({
				actions: { Pay: { inputs: [{ id: "a", teleport: true, utxo_source: "wallet" }] } },
			});

			expect(at(findings, "teleport")).toMatchObject({
				at: "action Pay / input a",
				declared: false,
				loadBearing: true,
			});
		});

		test("an unrecognised key on an output", () => {
			const findings = inspect({
				actions: { Pay: { outputs: [{ destination: "change", id: "b", rebate: 5 }] } },
			});

			expect(at(findings, "rebate")?.at).toBe("action Pay / output b");
		});

		test("collects the load-bearing ones for the slice that refuses on them", () => {
			const findings = inspect({
				actions: { Pay: { on_validate: "fn main() {}" } },
			});

			expect(loadBearing(findings).map((finding) => finding.key)).toContain("on_validate");
		});
	});

	describe("the sites it reaches", () => {
		test("a witness on an input", () => {
			const findings = inspect(flat);

			expect(at(findings, "sig_type")?.at).toBe(
				"action Receive / input p2pk_in / witness SIGNATURE",
			);
		});

		test("a script under a utxo type", () => {
			const findings = inspect({
				utxo_types: { vault: { script: { extra_leaves: [], source: "./a.simf" } } },
			});

			expect(at(findings, "extra_leaves")?.at).toBe("utxo type vault / script");
		});

		test("a parameter definition", () => {
			const findings = inspect({
				actions: { Pay: { params: { owner: { default: "0x00", type: "pubkey" } } } },
			});

			expect(at(findings, "default")?.at).toBe("action Pay / param owner");
		});

		test("a validation rule", () => {
			const findings = inspect(flat);

			expect(at(findings, "rule")?.at).toBe("action Pay / validation amount_nonzero");
		});

		test("a grouped method is reached the same way a flat action is", () => {
			const findings = inspect({
				classes: { Vault: { methods: { Open: { on_validate: "fn main() {}" } } } },
			});

			expect(at(findings, "on_validate")?.at).toBe("action Open");
		});
	});

	describe("what it does not claim", () => {
		test("an empty manifest produces nothing", () => {
			expect(inspect({})).toEqual([]);
		});

		test("a legacy spelling is not reported, because normalisation already rewrote it", () => {
			const findings = inspect({ actions: { Open: { deploy: true } }, compose_version: "0.1.0" });

			expect(at(findings, "deploy")).toBeUndefined();
			expect(at(findings, "compose_version")).toBeUndefined();
		});
	});
});
