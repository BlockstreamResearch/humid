import { describe, expect, test } from "bun:test";

import { type ExpectedOutput, guardBuiltOutputs, guardSpentInputs } from "./guards";
import { spentInputs, txOutsOf } from "./rawTransaction";

const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);

const POLICY_ASSET = "aa".repeat(32);
const OTHER_ASSET = "bb".repeat(32);
const WALLET_SCRIPT = `0014${"11".repeat(20)}`;
const CHANGE_SCRIPT = `0014${"44".repeat(20)}`;
const ELSEWHERE_SCRIPT = `0014${"99".repeat(20)}`;

const HIDDEN_ASSET = `0a${"33".repeat(32)}`;
const HIDDEN_VALUE = `08${"44".repeat(32)}`;
const NONCE = `02${"55".repeat(32)}`;

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
	const value = confidentialIssuance ? HIDDEN_VALUE : "01".padEnd(18, "0");
	const declared = issuance ? `${"00".repeat(32)}${"aa".repeat(32)}${value}00` : "";

	return `${reversed}${index}00ffffffff${declared}`;
}

function assetField(assetId: string): string {
	return `01${(assetId.match(/../g) ?? []).toReversed().join("")}`;
}

function explicit(sats: bigint, scriptHex: string, assetId = POLICY_ASSET): string {
	const value = `01${sats.toString(16).padStart(16, "0")}`;
	const length = (scriptHex.length / 2).toString(16).padStart(2, "0");

	return `${assetField(assetId)}${value}00${length}${scriptHex}`;
}

function scriptOf(scriptHex: string): string {
	return `${(scriptHex.length / 2).toString(16).padStart(2, "0")}${scriptHex}`;
}

function hidden(scriptHex: string): string {
	const length = (scriptHex.length / 2).toString(16).padStart(2, "0");

	return `${HIDDEN_ASSET}${HIDDEN_VALUE}${NONCE}${length}${scriptHex}`;
}

const FEE = explicit(500n, "");

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

const INPUT_WITNESS = "00000101aa00";
const EMPTY_INPUT_WITNESS = "00000000";
const OUTPUT_WITNESS = "0000";

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

	test("a witness marker that is neither absent nor present", () => {
		const marked = `02000000ff01${input({ txid: A, vout: 0 })}0100000000`;
		const result = spentInputs(marked);

		expect(result.ok).toBe(false);
		expect(result.ok || result.reason).toContain("witness marker");
	});

	test("an input count written in a wider form than the number needs", () => {
		expect(spentInputs(transaction(SPENDS, undefined, { inputCount: "fd0100" })).ok).toBe(false);
		expect(spentInputs(transaction(SPENDS)).ok).toBe(true);
	});

	test("and an output count written the same wrong way", () => {
		expect(txOutsOf(transaction(SPENDS, undefined, { outputCount: "fd0200" })).ok).toBe(false);
	});

	test("a script length no number can hold", () => {
		const spend = `${(A.match(/../g) ?? []).toReversed().join("")}00000000ffffffffffffffff00ffffffff`;

		expect(spentInputs(`020000000001${spend}01${FEE}00000000`).ok).toBe(false);
	});

	test("a transaction that ends before its locktime", () => {
		expect(spentInputs(transaction(SPENDS, undefined, { locktime: "" })).ok).toBe(false);
		expect(txOutsOf(transaction(SPENDS, undefined, { locktime: "" })).ok).toBe(false);
	});

	test("a transaction with bytes after the end of it", () => {
		const result = spentInputs(transaction(SPENDS, undefined, { trailing: "deadbeef" }));

		expect(result.ok).toBe(false);
		expect(result.ok || result.reason).toContain("after the end");
	});

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

	test("and one whose witness record is present and empty in every part", () => {
		const built = transaction(SPENDS, [explicit(1000n, WALLET_SCRIPT), FEE], {
			marker: "01",
			witness: `${EMPTY_INPUT_WITNESS}${OUTPUT_WITNESS}${OUTPUT_WITNESS}`,
		});

		expect(txOutsOf(built).ok).toBe(false);
	});

	test("and an issuance record that declares nothing at all", () => {
		const spend = input({ issuance: true, txid: A, vout: 2 }).replace(
			`${"aa".repeat(32)}${"01".padEnd(18, "0")}00`,
			`${"aa".repeat(32)}0000`,
		);

		expect(spentInputs(`020000000001${spend}01${FEE}00000000`).ok).toBe(false);
	});

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

	test("but not one whose issuance amount carries a prefix that means nothing there", () => {
		const spend = input({ issuance: true, txid: A, vout: 2 }).replace(
			`${"aa".repeat(32)}01`,
			`${"aa".repeat(32)}07`,
		);

		expect(spentInputs(`020000000001${spend}0100000000`).ok).toBe(false);
	});
});

describe("an output field whose prefix means nothing at that position", () => {
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

	test("an asset commitment written with a value's parity is refused", () => {
		const built = `08${"33".repeat(32)}${HIDDEN_VALUE}${NONCE}00`;

		expect(txOutsOf(transaction(SPENDS, [built, FEE])).ok).toBe(false);
	});

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
			txOutHex: built,
			valueForm: "commitment",
		});
	});
});

describe("an output written as neither one shape nor the other", () => {
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

	test("and refuses one the action required and the transaction left out", () => {
		const result = guardSpentInputs(transaction(SPENDS), {
			covenantInputs: [{ txid: B, vout: 4 }],
			walletInputs: [{ txid: A, vout: 0 }],
		});

		expect(result.ok).toBe(false);
		expect(result.ok || result.reason).toContain(`${B}:4`);
	});

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

	test("refuses when an output the protocol hides came back published", () => {
		const built = transaction(SPENDS, [explicit(1000n, WALLET_SCRIPT), FEE]);
		const result = guardBuiltOutputs(built, {
			...TAIL,
			outputs: [planned({ blinded: true, id: "principal_claimed" })],
		});

		expect(result.ok).toBe(false);
		expect(result.ok || result.reason).toContain("principal_claimed");
	});

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

	test("refuses an output paid in an asset the action did not plan for it", () => {
		const built = transaction(SPENDS, [explicit(1000n, WALLET_SCRIPT, OTHER_ASSET), FEE]);
		const result = guardBuiltOutputs(built, { ...TAIL, outputs: [planned()] });

		expect(result.ok).toBe(false);
		expect(result.ok || result.reason).toContain("asset");
	});

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

	test("refuses a fee other than the one the module reported", () => {
		const built = transaction(SPENDS, [explicit(1000n, WALLET_SCRIPT), explicit(9000n, "")]);
		const result = guardBuiltOutputs(built, { ...TAIL, outputs: [planned()] });

		expect(result.ok).toBe(false);
		expect(result.ok || result.reason).toContain("9000");
	});

	test("refuses a fee paid in something other than the network's own asset", () => {
		const built = transaction(SPENDS, [
			explicit(1000n, WALLET_SCRIPT),
			explicit(500n, "", OTHER_ASSET),
		]);
		const result = guardBuiltOutputs(built, { ...TAIL, outputs: [planned()] });

		expect(result.ok).toBe(false);
		expect(result.ok || result.reason).toContain("fee");
	});

	test("and refuses a fee whose amount is hidden", () => {
		const built = transaction(SPENDS, [explicit(1000n, WALLET_SCRIPT), hidden("")]);
		const result = guardBuiltOutputs(built, { ...TAIL, outputs: [planned()] });

		expect(result.ok).toBe(false);
		expect(result.ok || result.reason).toContain("fee");
	});

	test("refuses a scripted output standing in for the fee", () => {
		const built = transaction(SPENDS, [
			explicit(1000n, WALLET_SCRIPT),
			explicit(500n, CHANGE_SCRIPT),
		]);
		const result = guardBuiltOutputs(built, { ...TAIL, outputs: [planned()] });

		expect(result.ok).toBe(false);
		expect(result.ok || result.reason).toContain("fee");
	});

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
