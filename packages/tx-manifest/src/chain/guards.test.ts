import { describe, expect, test } from "bun:test";

import { type ExpectedOutput, guardBuiltOutputs, guardSpentInputs } from "./guards";
import { spentInputs, txOutsOf } from "./rawTransaction";

/**
 * The guards read bytes, so every case here is built as bytes.
 *
 * Each is a real Elements transaction with the inputs and outputs the case needs, written the
 * way the chain writes them: an explicit amount is a `01` prefix and eight big-endian bytes, a
 * hidden one is a commitment prefix and thirty-two, and an issuing input carries four more
 * fields after its sequence. A fixture assembled as an object shaped like an answer would let
 * this file assert something the reader could never see.
 *
 * Every script here is hex, on both sides of every comparison. Nothing in this package decodes
 * an address — there is no bech32 reader anywhere in it — so a script and an address are simply
 * two different strings, and the guard says they disagree.
 */

const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);

/** The asset the fee is paid in, and therefore the one the builder returns change in. */
const POLICY_ASSET = "aa".repeat(32);
const OTHER_ASSET = "bb".repeat(32);
const WALLET_SCRIPT = `0014${"11".repeat(20)}`;
const CHANGE_SCRIPT = `0014${"44".repeat(20)}`;
const ELSEWHERE_SCRIPT = `0014${"99".repeat(20)}`;

const HIDDEN_ASSET = `0a${"33".repeat(32)}`;
const HIDDEN_VALUE = `08${"44".repeat(32)}`;
const NONCE = `02${"55".repeat(32)}`;

/** One input: outpoint, empty script, sequence, and the issuance fields when it declares one. */
function input({
	confidentialIssuance,
	issuance,
	txid,
	vout,
}: {
	confidentialIssuance?: boolean;
	issuance?: boolean;
	txid: string;
	vout: number;
}): string {
	const reversed = (txid.match(/../g) ?? []).toReversed().join("");
	const marked = (issuance ? vout | 0x80_00_00_00 : vout) >>> 0;
	const index = (marked.toString(16).padStart(8, "0").match(/../g) ?? []).toReversed().join("");
	// The blinding nonce and the entropy, then the amount issued and the inflation keys. Both
	// amounts are confidential values — a prefix and then that many bytes — so a reader stepping
	// over a fixed width lands mid-field on the first transaction that hides one.
	const value = confidentialIssuance ? HIDDEN_VALUE : "01".padEnd(18, "0");
	const declared = issuance ? `${"00".repeat(32)}${"aa".repeat(32)}${value}00` : "";

	return `${reversed}${index}00ffffffff${declared}`;
}

/**
 * An asset id is serialised in reverse of how it is displayed, which is why it is turned round
 * here: a fixture that wrote it forwards would be asserting against a different asset.
 */
function assetField(assetId: string): string {
	return `01${(assetId.match(/../g) ?? []).toReversed().join("")}`;
}

function explicit(sats: bigint, scriptHex: string, assetId = POLICY_ASSET): string {
	const value = `01${sats.toString(16).padStart(16, "0")}`;
	const length = (scriptHex.length / 2).toString(16).padStart(2, "0");

	return `${assetField(assetId)}${value}00${length}${scriptHex}`;
}

/** A script's length prefix and the script, which every output ends with. */
function scriptOf(scriptHex: string): string {
	return `${(scriptHex.length / 2).toString(16).padStart(2, "0")}${scriptHex}`;
}

function hidden(scriptHex: string): string {
	const length = (scriptHex.length / 2).toString(16).padStart(2, "0");

	return `${HIDDEN_ASSET}${HIDDEN_VALUE}${NONCE}${length}${scriptHex}`;
}

/** The fee: no script at all, which is how the network reads the amount it charges. */
const FEE = explicit(500n, "");

/**
 * A whole Elements transaction, in the order the encoding writes one.
 *
 * Version, marker, inputs, outputs, **locktime**, and only then the witnesses — which is not
 * the order Bitcoin uses, and getting it the other way round would build fixtures no real
 * transaction resembles. Each part can be overridden on its own, because a guard that reads a
 * whole transaction can only be shown to do so by handing it partial ones.
 */
function transaction(
	spends: Parameters<typeof input>[0][],
	outputs: string[] = [explicit(1000n, WALLET_SCRIPT), FEE],
	overrides: {
		inputCount?: string;
		locktime?: string;
		marker?: string;
		outputCount?: string;
		trailing?: string;
		witness?: string;
	} = {},
): string {
	const inputCount = overrides.inputCount ?? spends.length.toString(16).padStart(2, "0");
	const outputCount = overrides.outputCount ?? outputs.length.toString(16).padStart(2, "0");
	const marker = overrides.marker ?? "00";
	const locktime = overrides.locktime ?? "00000000";

	return (
		`02000000${marker}${inputCount}${spends.map((spend) => input(spend)).join("")}` +
		`${outputCount}${outputs.join("")}${locktime}${overrides.witness ?? ""}${overrides.trailing ?? ""}`
	);
}

/**
 * A witness for one input: two range proofs and two stacks, of which one carries something.
 *
 * Four fields long whatever it holds, and not empty in all four. A transaction that sets the
 * marker and then writes a record with nothing in any part of it is one Elements rejects
 * outright — the marker is what says the record is there, and an empty record is the marker
 * contradicting itself.
 */
const INPUT_WITNESS = "00000101aa00";
/** The same four fields with nothing in any of them, which is the record that must be refused. */
const EMPTY_INPUT_WITNESS = "00000000";
/** And one for an output: a surjection proof and a range proof, both empty. */
const OUTPUT_WITNESS = "0000";

/** One of the action's own outputs, as everything about it the review settled. */
function planned(overrides: Partial<ExpectedOutput> = {}): ExpectedOutput {
	return {
		asset: POLICY_ASSET,
		blinded: false,
		id: "vault_out",
		sats: 1000n,
		scriptPubKeyHex: WALLET_SCRIPT,
		...overrides,
	};
}

const TAIL = {
	changeBlinded: false,
	changeScriptPubKeyHex: CHANGE_SCRIPT,
	feeSats: 500n,
	policyAsset: POLICY_ASSET,
};
const SPENDS = [{ txid: A, vout: 0 }];

describe("the bytes these cases are built from", () => {
	// The fixtures come first: a guard asserted against a transaction the reader parses
	// differently than intended would pass while proving nothing.
	test("read back as the outpoints they were written with", () => {
		expect(spentInputs(transaction([{ txid: A, vout: 1 }]))).toEqual({
			ok: true,
			spent: [{ txid: A, vout: 1 }],
		});
	});

	test("and as the amount, asset and blinding each output was written with", () => {
		const found = txOutsOf(
			transaction(SPENDS, [
				explicit(1000n, WALLET_SCRIPT),
				explicit(7n, WALLET_SCRIPT, OTHER_ASSET),
				hidden(WALLET_SCRIPT),
				FEE,
			]),
		);

		expect(found.ok).toBe(true);

		if (found.ok) {
			expect(found.txOuts.map((txOut) => txOut.amountSats)).toEqual([
				"1000",
				"7",
				undefined,
				"500",
			]);
			expect(found.txOuts.map((txOut) => txOut.rawAssetId)).toEqual([
				POLICY_ASSET,
				OTHER_ASSET,
				undefined,
				POLICY_ASSET,
			]);
			expect(found.txOuts[3]?.scriptPubKeyHex).toBe("");
		}
	});
});

describe("reading a transaction that is not one", () => {
	test("bytes that are not hex", () => {
		expect(spentInputs("zz").ok).toBe(false);
		expect(txOutsOf("zz").ok).toBe(false);
	});

	test("bytes that end before the inputs begin", () => {
		expect(spentInputs("0200").ok).toBe(false);
	});

	test("bytes that end inside an input", () => {
		const truncated = transaction(SPENDS).slice(0, 40);

		expect(spentInputs(truncated).ok).toBe(false);
	});

	test("bytes that end inside an output", () => {
		const whole = transaction(SPENDS);

		expect(txOutsOf(whole.slice(0, whole.length - 40)).ok).toBe(false);
	});

	// The byte after the version says whether witness data follows, and says it with a nought or
	// a one. Stepping over it without looking reads everything after this at an offset that
	// happens to be wrong, and reports something well-formed about the wrong outputs.
	test("a witness marker that is neither absent nor present", () => {
		const marked = `02000000ff01${input({ txid: A, vout: 0 })}0100000000`;
		const result = spentInputs(marked);

		expect(result.ok).toBe(false);
		expect(result.ok || result.reason).toContain("witness marker");
	});

	// A count written wider than it needs to be is the same number and a different transaction.
	// Reading both makes two byte strings one transaction, which is exactly the latitude a
	// guard comparing bytes cannot afford.
	test("an input count written in a wider form than the number needs", () => {
		expect(spentInputs(transaction(SPENDS, undefined, { inputCount: "fd0100" })).ok).toBe(false);
		// The same count written the one way the encoding permits is read.
		expect(spentInputs(transaction(SPENDS)).ok).toBe(true);
	});

	test("and an output count written the same wrong way", () => {
		expect(txOutsOf(transaction(SPENDS, undefined, { outputCount: "fd0200" })).ok).toBe(false);
	});

	// A length is a promise about how many bytes follow. One that no number can index is not a
	// large script, it is a claim nothing can act on — and converting it before checking is how
	// a reader turns a malformed transaction into an exception.
	test("a script length no number can hold", () => {
		const spend = `${(A.match(/../g) ?? []).toReversed().join("")}00000000ffffffffffffffff00ffffffff`;

		expect(spentInputs(`020000000001${spend}01${FEE}00000000`).ok).toBe(false);
	});

	// The whole transaction is parsed before any of it is reported, so what follows the part a
	// guard reads is checked too. Bytes whose prefix parses can be followed by anything.
	test("a transaction that ends before its locktime", () => {
		expect(spentInputs(transaction(SPENDS, undefined, { locktime: "" })).ok).toBe(false);
		expect(txOutsOf(transaction(SPENDS, undefined, { locktime: "" })).ok).toBe(false);
	});

	test("a transaction with bytes after the end of it", () => {
		const result = spentInputs(transaction(SPENDS, undefined, { trailing: "deadbeef" }));

		expect(result.ok).toBe(false);
		expect(result.ok || result.reason).toContain("after the end");
	});

	// A transaction that says it carries witness data and then runs out part-way through it is
	// not a transaction, and a reader that stopped at the locktime would call it one.
	test("a transaction whose witness data is cut short", () => {
		const built = transaction(SPENDS, [explicit(1000n, WALLET_SCRIPT), FEE], {
			marker: "01",
			witness: `${INPUT_WITNESS}${OUTPUT_WITNESS}`,
		});

		expect(txOutsOf(built).ok).toBe(false);
	});

	test("but reads one that carries all of it", () => {
		const built = transaction(SPENDS, [explicit(1000n, WALLET_SCRIPT), FEE], {
			marker: "01",
			witness: `${INPUT_WITNESS}${OUTPUT_WITNESS}${OUTPUT_WITNESS}`,
		});
		const found = txOutsOf(built);

		expect(found.ok).toBe(true);
		expect(found.ok && found.txOuts).toHaveLength(2);
	});

	test("and refuses one that announces witness data and writes none", () => {
		expect(txOutsOf(transaction(SPENDS, undefined, { marker: "01" })).ok).toBe(false);
	});

	// Elements rejects a witness record whose every part is empty rather than reading it as a
	// transaction without one, so a reader that accepted it would be calling something the
	// network refuses a finished transaction.
	test("and one whose witness record is present and empty in every part", () => {
		const built = transaction(SPENDS, [explicit(1000n, WALLET_SCRIPT), FEE], {
			marker: "01",
			witness: `${EMPTY_INPUT_WITNESS}${OUTPUT_WITNESS}${OUTPUT_WITNESS}`,
		});

		expect(txOutsOf(built).ok).toBe(false);
	});

	// The same rule one field down: an input that sets the issuance flag and then declares
	// neither an amount nor any inflation keys has announced a record with nothing in it.
	test("and an issuance record that declares nothing at all", () => {
		const spend = input({ issuance: true, txid: A, vout: 2 }).replace(
			`${"aa".repeat(32)}${"01".padEnd(18, "0")}00`,
			`${"aa".repeat(32)}0000`,
		);

		expect(spentInputs(`020000000001${spend}01${FEE}00000000`).ok).toBe(false);
	});

	// Elements marks issuance in the top bits of the index rather than in a field of its own,
	// so an index read without unmasking is a number no outpoint has — and the fields it
	// announces have to be walked or the next input is read out of the middle of this one.
	test("an issuing input is read as the outpoint it spends", () => {
		const result = spentInputs(
			transaction([
				{ issuance: true, txid: A, vout: 2 },
				{ txid: B, vout: 5 },
			]),
		);

		expect(result.ok && result.spent).toEqual([
			{ txid: A, vout: 2 },
			{ txid: B, vout: 5 },
		]);
	});

	test("including one whose issued amount is hidden rather than stated", () => {
		const result = spentInputs(
			transaction([
				{ confidentialIssuance: true, issuance: true, txid: A, vout: 2 },
				{ txid: B, vout: 5 },
			]),
		);

		expect(result.ok && result.spent).toEqual([
			{ txid: A, vout: 2 },
			{ txid: B, vout: 5 },
		]);
	});

	// An issuance amount is absent, explicit, or committed to. A prefix outside that set is not
	// a width to guess at: guessing walks thirty-two bytes into the next input's outpoint.
	test("but not one whose issuance amount carries a prefix that means nothing there", () => {
		const spend = input({ issuance: true, txid: A, vout: 2 }).replace(
			`${"aa".repeat(32)}01`,
			`${"aa".repeat(32)}07`,
		);

		expect(spentInputs(`020000000001${spend}0100000000`).ok).toBe(false);
	});
});

describe("an output field whose prefix means nothing at that position", () => {
	// Each of the three fields has its own prefixes, and the same byte means different things
	// at different positions. A reader that took any byte for a commitment would report a
	// corrupt transaction as one full of hidden amounts — the one answer a guard cannot check.
	const cases = [
		{ built: `07${"33".repeat(32)}${HIDDEN_VALUE}${NONCE}00`, what: "an asset" },
		{ built: `${HIDDEN_ASSET}07${"44".repeat(32)}${NONCE}00`, what: "a value" },
		{ built: `${HIDDEN_ASSET}${HIDDEN_VALUE}07${"55".repeat(32)}00`, what: "a nonce" },
	];

	for (const { built, what } of cases) {
		test(`${what} written with one is refused rather than read as hidden`, () => {
			expect(txOutsOf(transaction(SPENDS, [built, FEE])).ok).toBe(false);
		});
	}

	// The value commitment's own parities are `08` and `09`, and an asset's are `0a` and `0b`.
	// Neither is interchangeable, which is the whole reason the table is per field.
	test("an asset commitment written with a value's parity is refused", () => {
		const built = `08${"33".repeat(32)}${HIDDEN_VALUE}${NONCE}00`;

		expect(txOutsOf(transaction(SPENDS, [built, FEE])).ok).toBe(false);
	});

	// A nonce has no explicit form at all, so `01` there is not a shorter nonce — it is bytes
	// being read at an offset nothing else in this transaction agrees with.
	test("and an explicit nonce, which the encoding has no form for", () => {
		const built = `${HIDDEN_ASSET}${HIDDEN_VALUE}01${"55".repeat(32)}00`;

		expect(txOutsOf(transaction(SPENDS, [built, FEE])).ok).toBe(false);
	});

	test("while the prefixes each field does define are read", () => {
		const built = `0b${"33".repeat(32)}09${"44".repeat(32)}03${"55".repeat(32)}00`;
		const found = txOutsOf(transaction(SPENDS, [built, FEE]));

		expect(found.ok && found.txOuts[0]).toEqual({
			assetForm: "commitment",
			nonceForm: "commitment",
			scriptPubKeyHex: "",
			// The output's own bytes, which are the ones just written: an output carried out to
			// be spent has to be what the transaction holds rather than a re-encoding of it.
			txOutHex: built,
			valueForm: "commitment",
		});
	});
});

describe("an output written as neither one shape nor the other", () => {
	// An output is blinded or open as a whole. A committed value beside a published asset says
	// how much of what is being sent while claiming to hide it; a committed value with no nonce
	// is an amount nobody, the recipient included, can ever recover. Reduced to "did an amount
	// come back as a number", both are indistinguishable from the real thing.
	test("a committed value beside an explicit asset is refused, not read as hidden", () => {
		const mixed = `${assetField(POLICY_ASSET)}${HIDDEN_VALUE}${NONCE}${scriptOf(WALLET_SCRIPT)}`;
		const result = guardBuiltOutputs(transaction(SPENDS, [mixed, FEE]), {
			...TAIL,
			outputs: [planned({ blinded: true })],
		});

		expect(result.ok).toBe(false);
		expect(result.ok || result.reason).toContain("neither");
	});

	test("and a hidden output carrying no nonce for anyone to unblind it with", () => {
		const mixed = `${HIDDEN_ASSET}${HIDDEN_VALUE}00${scriptOf(WALLET_SCRIPT)}`;
		const result = guardBuiltOutputs(transaction(SPENDS, [mixed, FEE]), {
			...TAIL,
			outputs: [planned({ blinded: true })],
		});

		expect(result.ok).toBe(false);
	});

	// The same rule from the other side: an open output carries no nonce, because a nonce is
	// what a hidden one is unblinded with and an open one has nothing to unblind.
	test("and an open output carrying one anyway", () => {
		const mixed = `${assetField(POLICY_ASSET)}01${1000n.toString(16).padStart(16, "0")}${NONCE}${scriptOf(WALLET_SCRIPT)}`;
		const result = guardBuiltOutputs(transaction(SPENDS, [mixed, FEE]), {
			...TAIL,
			outputs: [planned()],
		});

		expect(result.ok).toBe(false);
	});

	test("and change written the same mixed way", () => {
		const mixed = `${assetField(POLICY_ASSET)}${HIDDEN_VALUE}${NONCE}${scriptOf(CHANGE_SCRIPT)}`;
		const result = guardBuiltOutputs(
			transaction(SPENDS, [explicit(1000n, WALLET_SCRIPT), mixed, FEE]),
			{ ...TAIL, changeBlinded: true, outputs: [planned()] },
		);

		expect(result.ok).toBe(false);
	});
});

describe("a transaction that spends what it was supposed to", () => {
	test("passes when the observed set is exactly the expected one", () => {
		expect(
			guardSpentInputs(
				transaction([
					{ txid: A, vout: 0 },
					{ txid: B, vout: 1 },
				]),
				{ covenantInputs: [{ txid: A, vout: 0 }], walletInputs: [{ txid: B, vout: 1 }] },
			),
		).toEqual({ ok: true });
	});

	// A txid is thirty-two bytes and the case it is written in is not part of which output it
	// names. Two sides spelling it differently must not be two different outputs.
	test("whatever case either side wrote the transaction id in", () => {
		expect(
			guardSpentInputs(transaction(SPENDS), {
				covenantInputs: [],
				walletInputs: [{ txid: A.toUpperCase(), vout: 0 }],
			}),
		).toEqual({ ok: true });
	});

	test("refuses an input nothing asked for", () => {
		const result = guardSpentInputs(
			transaction([
				{ txid: A, vout: 0 },
				{ txid: C, vout: 3 },
			]),
			{ covenantInputs: [], walletInputs: [{ txid: A, vout: 0 }] },
		);

		expect(result.ok).toBe(false);
		expect(result.ok || result.reason).toContain(`${C}:3`);
	});

	// A transaction that spends less than the action requires is not a safer version of it.
	test("and refuses one the action required and the transaction left out", () => {
		const result = guardSpentInputs(transaction(SPENDS), {
			covenantInputs: [{ txid: B, vout: 4 }],
			walletInputs: [{ txid: A, vout: 0 }],
		});

		expect(result.ok).toBe(false);
		expect(result.ok || result.reason).toContain(`${B}:4`);
	});

	// Comparing sets answers "was every one of these mentioned" and cannot answer "how many
	// times". A transaction spending one output twice is not a transaction at all, and a guard
	// that could not see it would be answering a different question than the one it is for.
	test("refuses a transaction that spends one output twice", () => {
		const result = guardSpentInputs(
			transaction([
				{ txid: A, vout: 0 },
				{ txid: A, vout: 0 },
			]),
			{ covenantInputs: [], walletInputs: [{ txid: A, vout: 0 }] },
		);

		expect(result.ok).toBe(false);
		expect(result.ok || result.reason).toContain("twice");
	});

	test("however each of the two was spelled", () => {
		const result = guardSpentInputs(
			transaction([
				{ txid: A, vout: 0 },
				{ txid: A.toUpperCase(), vout: 0 },
			]),
			{ covenantInputs: [], walletInputs: [{ txid: A, vout: 0 }] },
		);

		expect(result.ok).toBe(false);
	});

	// The same collapse from the other side: a wallet that asked for one output twice has
	// already lost track of what it is spending, and is in no position to check anything.
	test("and refuses an expectation that names one output twice", () => {
		const result = guardSpentInputs(transaction(SPENDS), {
			covenantInputs: [],
			walletInputs: [
				{ txid: A, vout: 0 },
				{ txid: A, vout: 0 },
			],
		});

		expect(result.ok).toBe(false);
		expect(result.ok || result.reason).toContain("more than once");
	});

	test("including one named once as a covenant input and once as a wallet output", () => {
		const result = guardSpentInputs(transaction(SPENDS), {
			covenantInputs: [{ txid: A, vout: 0 }],
			walletInputs: [{ txid: A, vout: 0 }],
		});

		expect(result.ok).toBe(false);
	});

	test("an issuing input counts as the outpoint it spends, not as an extra one", () => {
		expect(
			guardSpentInputs(transaction([{ issuance: true, txid: A, vout: 0 }]), {
				covenantInputs: [],
				walletInputs: [{ txid: A, vout: 0 }],
			}),
		).toEqual({ ok: true });
	});
});

describe("a transaction that carries the outputs the wallet planned", () => {
	test("passes when every output came back the way it was built", () => {
		const built = transaction(SPENDS, [
			hidden(WALLET_SCRIPT),
			explicit(2000n, ELSEWHERE_SCRIPT),
			explicit(900n, CHANGE_SCRIPT),
			FEE,
		]);

		expect(
			guardBuiltOutputs(built, {
				...TAIL,
				outputs: [
					planned({ blinded: true, id: "principal_claimed" }),
					planned({ id: "vault_out", sats: 2000n, scriptPubKeyHex: ELSEWHERE_SCRIPT }),
				],
			}),
		).toEqual({ ok: true });
	});

	test("and when it returns no change at all", () => {
		const built = transaction(SPENDS, [explicit(1000n, WALLET_SCRIPT), FEE]);

		expect(guardBuiltOutputs(built, { ...TAIL, outputs: [planned()] })).toEqual({ ok: true });
	});

	// The failure the blinding half of this guard exists for. The amount is on the chain and no
	// later step can take it back, so the transaction is refused rather than returned.
	test("refuses when an output the protocol hides came back published", () => {
		const built = transaction(SPENDS, [explicit(1000n, WALLET_SCRIPT), FEE]);
		const result = guardBuiltOutputs(built, {
			...TAIL,
			outputs: [planned({ blinded: true, id: "principal_claimed" })],
		});

		expect(result.ok).toBe(false);
		expect(result.ok || result.reason).toContain("principal_claimed");
	});

	// The opposite failure, which costs more: a covenant output built hidden is one its own
	// contract can never read, and nobody finds out until they try to spend it.
	test("and when one it leaves open came back hidden", () => {
		const built = transaction(SPENDS, [hidden(WALLET_SCRIPT), FEE]);
		const result = guardBuiltOutputs(built, { ...TAIL, outputs: [planned()] });

		expect(result.ok).toBe(false);
		expect(result.ok || result.reason).toContain("vault_out");
	});

	test("refuses an output paid to a script this action did not build it for", () => {
		const built = transaction(SPENDS, [explicit(1000n, ELSEWHERE_SCRIPT), FEE]);
		const result = guardBuiltOutputs(built, { ...TAIL, outputs: [planned()] });

		expect(result.ok).toBe(false);
		expect(result.ok || result.reason).toContain("script");
	});

	test("refuses an output paid the wrong amount", () => {
		const built = transaction(SPENDS, [explicit(999n, WALLET_SCRIPT), FEE]);
		const result = guardBuiltOutputs(built, { ...TAIL, outputs: [planned()] });

		expect(result.ok).toBe(false);
		expect(result.ok || result.reason).toContain("999");
	});

	// The right amount of the wrong thing is not the right output, and on a chain with more
	// than one asset that is a transaction nobody agreed to rather than a rounding error.
	test("refuses an output paid in an asset the action did not plan for it", () => {
		const built = transaction(SPENDS, [explicit(1000n, WALLET_SCRIPT, OTHER_ASSET), FEE]);
		const result = guardBuiltOutputs(built, { ...TAIL, outputs: [planned()] });

		expect(result.ok).toBe(false);
		expect(result.ok || result.reason).toContain("asset");
	});

	// A hidden output states its script and nothing else, so the script is what is compared —
	// and it is compared, because an output the protocol wanted hidden is still an output that
	// has to go somewhere the action chose.
	test("refuses a hidden output paid to the wrong script", () => {
		const built = transaction(SPENDS, [hidden(ELSEWHERE_SCRIPT), FEE]);
		const result = guardBuiltOutputs(built, {
			...TAIL,
			outputs: [planned({ blinded: true, id: "principal_claimed" })],
		});

		expect(result.ok).toBe(false);
	});

	test("refuses a transaction carrying fewer outputs than the action built", () => {
		const built = transaction(SPENDS, [explicit(1000n, WALLET_SCRIPT)]);
		const result = guardBuiltOutputs(built, {
			...TAIL,
			outputs: [planned({ id: "one" }), planned({ id: "two" })],
		});

		expect(result.ok).toBe(false);
		expect(result.ok || result.reason).toContain("1 outputs");
	});
});

describe("what the builder is allowed to add after them", () => {
	// The attack the tail check exists for. A finalizer that may append anything scripted can
	// append an output of its own, give it the blinding the guard expects of change, and pass.
	test("refuses an output of the module's own beside the change", () => {
		const built = transaction(SPENDS, [
			explicit(1000n, WALLET_SCRIPT),
			explicit(900n, CHANGE_SCRIPT),
			explicit(50n, ELSEWHERE_SCRIPT),
			FEE,
		]);
		const result = guardBuiltOutputs(built, { ...TAIL, outputs: [planned()] });

		expect(result.ok).toBe(false);
	});

	test("and one appended in place of the change", () => {
		const built = transaction(SPENDS, [
			explicit(1000n, WALLET_SCRIPT),
			explicit(900n, ELSEWHERE_SCRIPT),
			FEE,
		]);
		const result = guardBuiltOutputs(built, { ...TAIL, outputs: [planned()] });

		expect(result.ok).toBe(false);
		expect(result.ok || result.reason).toContain("change");
	});

	test("refuses change that came back the opposite way round", () => {
		const built = transaction(SPENDS, [explicit(1000n, WALLET_SCRIPT), hidden(CHANGE_SCRIPT), FEE]);
		const result = guardBuiltOutputs(built, { ...TAIL, outputs: [planned()] });

		expect(result.ok).toBe(false);
		expect(result.ok || result.reason).toContain("the change");
	});

	// Only the asset the fee is paid in has change the builder appends; every other asset's
	// surplus is an exact figure the review builds as one of the action's own outputs.
	test("refuses change in an asset the builder had no business creating", () => {
		const built = transaction(SPENDS, [
			explicit(1000n, WALLET_SCRIPT),
			explicit(900n, CHANGE_SCRIPT, OTHER_ASSET),
			FEE,
		]);
		const result = guardBuiltOutputs(built, { ...TAIL, outputs: [planned()] });

		expect(result.ok).toBe(false);
	});

	test("refuses a transaction that pays no fee", () => {
		const built = transaction(SPENDS, [explicit(1000n, WALLET_SCRIPT)]);
		const result = guardBuiltOutputs(built, { ...TAIL, outputs: [planned()] });

		expect(result.ok).toBe(false);
		expect(result.ok || result.reason).toContain("fee");
	});

	test("and one that pays two", () => {
		const built = transaction(SPENDS, [explicit(1000n, WALLET_SCRIPT), FEE, FEE]);
		const result = guardBuiltOutputs(built, { ...TAIL, outputs: [planned()] });

		expect(result.ok).toBe(false);
		expect(result.ok || result.reason).toContain("two fees");
	});

	// The fee is the one figure taken from the module, and it is taken in order to be checked:
	// what it says it charged against what it actually wrote.
	test("refuses a fee other than the one the module reported", () => {
		const built = transaction(SPENDS, [explicit(1000n, WALLET_SCRIPT), explicit(9000n, "")]);
		const result = guardBuiltOutputs(built, { ...TAIL, outputs: [planned()] });

		expect(result.ok).toBe(false);
		expect(result.ok || result.reason).toContain("9000");
	});

	// A fee pays the network in the money the network takes. Reading which asset that is off
	// the fee output itself would make the check circular — it would be the right asset by
	// definition — so it is stated on the review and compared against.
	test("refuses a fee paid in something other than the network's own asset", () => {
		const built = transaction(SPENDS, [
			explicit(1000n, WALLET_SCRIPT),
			explicit(500n, "", OTHER_ASSET),
		]);
		const result = guardBuiltOutputs(built, { ...TAIL, outputs: [planned()] });

		expect(result.ok).toBe(false);
		expect(result.ok || result.reason).toContain("fee");
	});

	// The network reads the fee's amount in order to charge it, so a hidden one is not a
	// transaction anything can accept.
	test("and refuses a fee whose amount is hidden", () => {
		const built = transaction(SPENDS, [explicit(1000n, WALLET_SCRIPT), hidden("")]);
		const result = guardBuiltOutputs(built, { ...TAIL, outputs: [planned()] });

		expect(result.ok).toBe(false);
		expect(result.ok || result.reason).toContain("fee");
	});

	// The last output is the fee because it has no script, not because it happens to carry the
	// right number. An output that pays the fee's amount to somebody's script is change-shaped
	// money leaving the transaction, and the fee itself is then missing entirely.
	test("refuses a scripted output standing in for the fee", () => {
		const built = transaction(SPENDS, [
			explicit(1000n, WALLET_SCRIPT),
			explicit(500n, CHANGE_SCRIPT),
		]);
		const result = guardBuiltOutputs(built, { ...TAIL, outputs: [planned()] });

		expect(result.ok).toBe(false);
		expect(result.ok || result.reason).toContain("fee");
	});

	// The fee is last in what this builder produces, and a transaction that puts it elsewhere
	// is one this wallet has no account of. Refusing is the safe direction: nothing is returned.
	test("and one whose fee is not where the builder puts it", () => {
		const built = transaction(SPENDS, [
			explicit(1000n, WALLET_SCRIPT),
			FEE,
			explicit(900n, CHANGE_SCRIPT),
		]);
		const result = guardBuiltOutputs(built, { ...TAIL, outputs: [planned()] });

		expect(result.ok).toBe(false);
	});
});
