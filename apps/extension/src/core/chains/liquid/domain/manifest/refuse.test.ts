import { describe, expect, test } from "bun:test";

import { normaliseManifest } from "./normalise";
import { buildMode, refuseUnsupported } from "./refuse";

// Three refusals, each naming its reason. The rule they enforce is the format's own: the
// ELIP draft says a tool that does not implement an extension must reject a manifest using
// its fields rather than ignoring them. What this adds is that a refusal is a refusal —
// there is no shape of any of these that returns a warning to click through.

const SHIPPED = "0.6.0";

function refuse(raw: Record<string, unknown>, sources: Record<string, string> = {}) {
	const result = refuseUnsupported(normaliseManifest(raw).manifest, {
		compilerVersion: SHIPPED,
		contractSources: sources,
		policyAsset: "144c654344aa716d6f3abcc1ca90e5641e4e2a7f633bc09fe3baf64585819a49",
	});

	return result ? result.reason : "";
}

describe("an unrecognised construct in a load-bearing position", () => {
	test("refuses, naming the construct and where it was", () => {
		const reason = refuse({
			actions: { Pay: { inputs: [{ id: "a", teleport: true, utxo_source: "wallet" }] } },
		});

		expect(reason).toContain("teleport");
		expect(reason).toContain("input a");
	});

	test("refuses a construct the format has and this runtime does not implement", () => {
		expect(refuse({ actions: { Open: { on_validate: "fn main() { }" } } })).toContain(
			"on_validate",
		);
	});

	// AC-02's other half, built in slice 4: a decorative construct is ignored rather than
	// refused, and the review carries the record of it.
	test("says nothing about a decorative construct", () => {
		expect(refuse({ attestation_version: "1" })).toBe("");
	});

	test("says nothing about an unrecognised key inside a display block", () => {
		expect(refuse({ actions: { Pay: { ui: { icon: "vault.svg" } } } })).toBe("");
	});

	test("says nothing about the published p2pk manifest's own constructs it acts on", () => {
		expect(refuse({ utxo_types: { v: { script: { source: "./v.simf" } } } })).toBe("");
	});
});

describe("a foreign compiler version", () => {
	test("refuses a manifest declaring one, naming both versions", () => {
		const reason = refuse({ simplicity_hl_version: "0.7.0" });

		expect(reason).toContain("0.7.0");
		expect(reason).toContain(SHIPPED);
	});

	test("proceeds when the manifest declares the version that ships", () => {
		expect(refuse({ simplicity_hl_version: SHIPPED })).toBe("");
	});

	// Four of the seven published manifests declare no version at all. Refusing on silence
	// would reject them for a reason that has nothing to do with trust.
	test("proceeds when the manifest declares nothing", () => {
		expect(refuse({})).toBe("");
	});

	test("refuses a contract source whose simc directive asks for another version", () => {
		const reason = refuse({}, { "./a.simf": 'simc "0.5.0";\nfn main() { }' });

		expect(reason).toContain("0.5.0");
		expect(reason).toContain("./a.simf");
	});

	test("proceeds when the source asks for the version that ships", () => {
		expect(refuse({}, { "./a.simf": `simc "${SHIPPED}";\nfn main() { }` })).toBe("");
	});

	test("proceeds when the source names no version", () => {
		expect(refuse({}, { "./a.simf": "fn main() { }" })).toBe("");
	});

	test("accepts a range the shipped version satisfies", () => {
		expect(refuse({}, { "./a.simf": 'simc ">=0.6.0";\nfn main() { }' })).toBe("");
	});

	test("refuses a range the shipped version does not satisfy, naming it", () => {
		expect(refuse({}, { "./a.simf": 'simc ">=0.7.0";\nfn main() { }' })).toContain(">=0.7.0");
	});
});

// AC-15. The mode is not an attack surface — the wallet rebuilds the contract itself and
// refuses unless the derived address matches where the funds sit — so this decides what the
// wallet computes, never what it checks against. No setting governs it and none exists.
describe("the build mode a protocol declares", () => {
	test("a protocol declaring debug symbols is built with them", () => {
		expect(buildMode(normaliseManifest({ compile_debug_symbols: true }).manifest)).toBe(true);
	});

	test("a protocol declaring them off is built without them", () => {
		expect(buildMode(normaliseManifest({ compile_debug_symbols: false }).manifest)).toBe(false);
	});

	test("a protocol declaring nothing is built plainly", () => {
		expect(buildMode(normaliseManifest({}).manifest)).toBe(false);
	});

	test("a declaration that is not a mode is refused rather than guessed at", () => {
		expect(refuse({ compile_debug_symbols: "yes" })).toContain("compile_debug_symbols");
	});
});

// `chain` names the network family rather than one of its networks: every published manifest
// says "liquid", and a protocol is not written twice for testnet and mainnet.
describe("a protocol for another chain", () => {
	test("accepts the family every published manifest declares", () => {
		expect(refuse({ chain: "liquid" })).toBe("");
	});

	test("accepts the other Liquid network names", () => {
		expect(refuse({ chain: "liquid-testnet" })).toBe("");
		expect(refuse({ chain: "elements-regtest" })).toBe("");
	});

	test("refuses one this wallet cannot build for, naming it", () => {
		expect(refuse({ chain: "bitcoin" })).toContain("bitcoin");
	});

	test("proceeds when the manifest declares no chain", () => {
		expect(refuse({})).toBe("");
	});
});
