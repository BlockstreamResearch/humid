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

/** The actions that declare no change output at all, which the module appends one for anyway. */
function actionsWithoutChange(document: Record<string, unknown>) {
	const { manifest } = normaliseManifest(document);

	return manifest.actions
		.filter((action) =>
			asArray(action.node.outputs).every((entry) => asRecord(entry)?.destination !== "change"),
		)
		.map((action) => action.name);
}

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

/**
 * The one deviation, and what it costs.
 *
 * A contract action can be funded only by outputs that hide nothing: unblinding one needs the
 * secrets that go with it, and the signing module is handed an outpoint and its bytes and
 * nothing more. So change returned hidden is money the next action cannot reach, and a sequence
 * of actions starves itself after the first.
 *
 * The wallet publishes it instead. That is against the format, which says silence about
 * confidentiality is itself a decision and that this network's decision is to hide, and the
 * change amount is on the chain as a result. The word that was set aside is carried out of here
 * so a person can be told which one it was.
 */
describe("what this wallet does with a contract action's own change", () => {
	test("publishes it, over the network's default that would have hidden it", () => {
		expect(resolveBlinding({ change: true })).toEqual({
			blinding: "open",
			decidedBy: "spendable-change",
			overrode: "chain",
		});
	});

	test("and over the document's own default, carrying that word instead", () => {
		expect(resolveBlinding({ change: true, documentDefault: true })).toEqual({
			blinding: "open",
			decidedBy: "spendable-change",
			overrode: "document",
		});
	});

	// The case a person is owed the most: the protocol asked for this outright and the wallet
	// published it anyway, because honouring the request would have stranded their money.
	test("and over the protocol asking for it outright, carrying that word instead", () => {
		expect(resolveBlinding({ change: true, declared: true })).toEqual({
			blinding: "open",
			decidedBy: "spendable-change",
			overrode: "output",
		});
	});

	// Only where the format would have hidden. A protocol asking for open change is agreed
	// with, and nothing was overridden, so nothing claims to have been.
	test("but overrides nothing when the protocol asked for open change itself", () => {
		expect(resolveBlinding({ change: true, declared: false })).toEqual({
			blinding: "open",
			decidedBy: "output",
		});
	});

	// The deviation is exactly this wide. An output paid to the wallet is not change, however
	// much it looks like money coming back, and it is left hidden where the format hides it.
	test("and reaches nothing that is not change", () => {
		expect(resolveBlinding({})).toEqual({ blinding: "hidden", decidedBy: "chain" });
		expect(resolveBlinding({ declared: true })).toEqual({
			blinding: "hidden",
			decidedBy: "output",
		});
	});
});

/** Every output the corpus declares, with the destination that decides whether it can hide. */
function outputsOf(document: Record<string, unknown>) {
	const { manifest } = normaliseManifest(document);
	const found: { change?: boolean; declared: unknown; unblindable?: "covenant" | "data" }[] = [];

	for (const action of manifest.actions) {
		for (const entry of asArray(action.node.outputs)) {
			const output = asRecord(entry);
			const destination = asRecord(output?.destination);

			found.push({
				declared: output?.confidential,
				...(output?.destination === "change" ? { change: true } : {}),
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

describe("what the published protocols resolve to", () => {
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
		// twenty because the protocol said so.
		//
		// Twenty-nine are change, and not one document in the corpus says a word about any of
		// them — so every one of those was hidden by this network's default until the wallet
		// began publishing them, and each is an amount now on the chain that the format would
		// have kept off it. What is left hidden by silence is nine.
		expect(counted).toEqual({
			"hidden/chain": 9,
			"open/output": 20,
			"open/spendable-change": 29,
			"open/unblindable": 39,
		});
	});

	/**
	 * The silence that used to get two answers.
	 *
	 * A declared change output saying nothing resolved hidden; an action declaring no change
	 * output at all had nothing to resolve and fell through to open. The signing module appends
	 * change either way, so one absence of a word built two opposite outputs. These three
	 * actions, across two of the four protocols, are where that was reachable.
	 *
	 * Both cases are a contract action's own change, so both are published now. The
	 * inconsistency did not have to be decided; it stopped existing.
	 */
	test("and the three actions that declare no change output, which the module appends one for", () => {
		expect(
			Object.keys(CORPUS).flatMap((name) =>
				actionsWithoutChange(CORPUS[name]!).map((action) => `${name}.${action}`),
			),
		).toEqual(["last_will.ColdBreak", "last_will.Refresh", "lending_v2.PrepareLender"]);
	});
});
