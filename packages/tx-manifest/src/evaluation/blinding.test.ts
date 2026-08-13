import { describe, expect, test } from "bun:test";

import dex from "../__fixtures__/current/dex.manifest.json";
import lastWill from "../__fixtures__/current/last_will.manifest.json";
import lendingV2 from "../__fixtures__/current/lending_v2.manifest.json";
import lendingV3 from "../__fixtures__/current/lending_v3.manifest.json";
import { asArray, asRecord } from "../document/json";
import { normaliseManifest } from "../document/normalise";
import { resolveBlinding } from "./blinding";

const CORPUS = {
	dex,
	last_will: lastWill,
	lending_v2: lendingV2,
	lending_v3: lendingV3,
} as unknown as Record<string, Record<string, unknown>>;

describe("the order the format resolves blinding in", () => {
	test("the output's own word comes first, over the document's", () => {
		expect(resolveBlinding({ declared: false, documentDefault: true })).toEqual({
			blinding: "open",
			decidedBy: "output",
		});
		expect(resolveBlinding({ declared: true, documentDefault: false })).toEqual({
			blinding: "hidden",
			decidedBy: "output",
		});
	});

	test("the document's word comes next, when the output says nothing", () => {
		expect(resolveBlinding({ documentDefault: false })).toEqual({
			blinding: "open",
			decidedBy: "document",
		});
	});

	// The step that makes silence a decision. On Liquid an output nobody spoke about is hidden,
	// so a runtime that read the first two steps and stopped would build the opposite.
	test("and silence means hidden, because that is this network's own default", () => {
		expect(resolveBlinding({})).toEqual({ blinding: "hidden", decidedBy: "chain" });
	});

	// Before the precedence is consulted at all: a Simplicity program reads exact amounts
	// through jets that cannot introspect a commitment, and an OP_RETURN carries no value.
	test("a covenant output and an OP_RETURN are open whatever anything says", () => {
		expect(resolveBlinding({ declared: true, unblindable: "covenant" })).toEqual({
			blinding: "open",
			decidedBy: "unblindable",
		});
		expect(resolveBlinding({ documentDefault: true, unblindable: "data" })).toEqual({
			blinding: "open",
			decidedBy: "unblindable",
		});
	});
});

describe("what the published protocols resolve to", () => {
	/** Every output the corpus declares, with the destination that decides whether it can hide. */
	function outputsOf(document: Record<string, unknown>) {
		const { manifest } = normaliseManifest(document);
		const found: { declared: unknown; unblindable?: "covenant" | "data" }[] = [];

		for (const action of manifest.actions) {
			for (const entry of asArray(action.node.outputs)) {
				const output = asRecord(entry);
				const destination = asRecord(output?.destination);

				found.push({
					declared: output?.confidential,
					...(typeof destination?.utxo_type === "string"
						? { unblindable: "covenant" as const }
						: destination?.type === "op_return"
							? { unblindable: "data" as const }
							: {}),
				});
			}
		}

		return found;
	}

	// The count this issue turns on. Every output the four protocols declare, by what decided
	// it — and the number decided by the network's own default is the number this wallet
	// cannot build the moment anything acts on the answer.
	test("counted across every output of every protocol", () => {
		const counted: Record<string, number> = {};

		for (const name of Object.keys(CORPUS)) {
			for (const output of outputsOf(CORPUS[name]!)) {
				const { blinding, decidedBy } = resolveBlinding({
					...output,
					documentDefault: CORPUS[name]!.confidential_outputs,
				});

				counted[`${blinding}/${decidedBy}`] = (counted[`${blinding}/${decidedBy}`] ?? 0) + 1;
			}
		}

		// Nothing is ever decided by the document: no published manifest states a file-level
		// default. Thirty-nine outputs are open because their destination could never hide and
		// twenty because the protocol said so — while thirty-eight are hidden purely because
		// nobody spoke, and every one of those is an output this wallet cannot build.
		expect(counted).toEqual({
			"hidden/chain": 38,
			"open/output": 20,
			"open/unblindable": 39,
		});
	});
});
