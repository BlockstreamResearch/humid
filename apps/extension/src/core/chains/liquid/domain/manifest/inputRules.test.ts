import { describe, expect, test } from "bun:test";

import { encodeDataParts } from "./encode";
import { resolveInputRules } from "./inputRules";
import { type NormalisedAction, normaliseManifest } from "./normalise";
import type { ReferenceScope } from "./references";

// Three constructs the approved specification names as in scope because lending_v3 and
// last_will cannot be built without them. The shapes below are the ones those manifests
// actually use, not invented ones.

function action(node: Record<string, unknown>): NormalisedAction {
	return normaliseManifest({ actions: { Act: node } }).manifest.actions[0]!;
}

function rules(node: Record<string, unknown>, scope: ReferenceScope = { params: {} }) {
	return resolveInputRules(action(node), scope);
}

describe("a sequence", () => {
	// dex and lending_v2 both carry this bare number, which disables replaceability.
	test("as a bare number is the sequence field itself", () => {
		const result = rules({ inputs: [{ id: "a", sequence: 4_294_967_294 }] });

		expect(result.ok && result.rules[0]?.sequence).toBe(4_294_967_294);
	});

	// last_will's shape: a relative timelock whose count comes from the deployment.
	test("as relative blocks resolves through the deployment's fields", () => {
		const result = rules(
			{ inputs: [{ id: "a", sequence: { relative_blocks: "instance.INHERIT_BLOCKS" } }] },
			{ instance: { INHERIT_BLOCKS: 144n }, params: {} },
		);

		expect(result.ok && result.rules[0]?.sequence).toBe(144);
	});

	test("as a literal relative-blocks count too", () => {
		expect(rules({ inputs: [{ id: "a", sequence: { relative_blocks: 6 } }] }).ok).toBe(true);
	});

	// BIP68 gives the count sixteen bits. A larger one truncated is a different timelock.
	test("beyond what a relative timelock can express is refused, not truncated", () => {
		const result = rules({ inputs: [{ id: "a", sequence: { relative_blocks: 70_000 } }] });

		expect(result.ok ? "" : result.reason).toContain("70000");
	});

	test("that cannot be resolved refuses, naming the input", () => {
		const result = rules({
			inputs: [{ id: "vault_in", sequence: { relative_blocks: "nowhere" } }],
		});

		expect(result.ok ? "" : result.reason).toContain("vault_in");
	});

	test("an input declaring none carries none", () => {
		expect(rules({ inputs: [{ id: "a" }] }).ok && rules({ inputs: [{ id: "a" }] })).toMatchObject({
			rules: [{ id: "a" }],
		});
	});
});

describe("from_address", () => {
	// lending_v2's shape: the borrower's own address, from the deployment.
	test("resolves through the deployment's fields", () => {
		const result = rules(
			{ inputs: [{ from_address: "instance.BORROWER_ADDRESS", id: "a" }] },
			{ instance: { BORROWER_ADDRESS: "tex1q_borrower" }, params: {} },
		);

		expect(result.ok && result.rules[0]?.fromAddress).toBe("tex1q_borrower");
	});

	test("refuses when the deployment does not carry it", () => {
		const result = rules({ inputs: [{ from_address: "instance.MISSING", id: "a" }] });

		expect(result.ok).toBe(false);
	});
});

// lending_v3's shape: a byte layout whose parts are references into the deployment, with a
// comment beside them that is not a part.
describe("object-form data", () => {
	const resolve = (reference: string) =>
		reference === "instance.FACTORY_PROGRAM_ID"
			? ({ ok: true, value: "0xdeadbeef" } as const)
			: ({ ok: false, reason: `no ${reference}` } as const);

	test("resolves each part before encoding it", () => {
		const result = encodeDataParts(
			{
				$comment: "50-byte layout must match the protocol's own encoder",
				parts: [
					{ type: "bytes", value: "instance.FACTORY_PROGRAM_ID" },
					{ type: "u8", value: 3 },
				],
			},
			resolve,
		);

		expect(result).toEqual({ hex: "deadbeef03", ok: true });
	});

	test("refuses a part it cannot resolve rather than encoding the reference text", () => {
		const result = encodeDataParts(
			{ parts: [{ type: "bytes", value: "instance.MISSING" }] },
			resolve,
		);

		expect(result.ok ? "" : result.reason).toContain("instance.MISSING");
	});

	test("a literal is taken as itself", () => {
		expect(encodeDataParts({ parts: [{ type: "bytes", value: "0x0102" }] }, resolve)).toEqual({
			hex: "0102",
			ok: true,
		});
	});
});
