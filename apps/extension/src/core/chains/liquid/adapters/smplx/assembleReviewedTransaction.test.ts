import { describe, expect, test } from "bun:test";

import { type ManifestReview, computed, fromDapp } from "@humid/tx-manifest";

import {
	type AssembledTransaction,
	type AssemblingBuilder,
	assembleReviewedTransaction,
} from "./assembleReviewedTransaction";

const COVENANT_SCRIPT = `5120${"11".repeat(32)}`;
const COVENANT_BUILD = {
	argumentsJson: '{"PUB_KEY":{"type":"Pubkey","value":"0x00"}}',
	cmr: "cc".repeat(32),
	extraLeavesJson: "[]",
	includeDebugSymbols: false,
	source: "fn main() { }",
	sourcePath: "./p2pk.simf",
	tapleafHash: "1e".repeat(32),
};
const WALLET_SCRIPT = `0014${"33".repeat(20)}`;
const CHANGE_SCRIPT = `0014${"44".repeat(20)}`;
const ASSET = "144c654344aa716d6f3abcc1ca90e5641e4e2a7f633bc09fe3baf64585819a49";
const CONFIDENTIAL_VALUE = `08${"44".repeat(32)}`;
const CONFIDENTIAL_ASSET = `0a${"33".repeat(32)}`;
const NONCE = `02${"55".repeat(32)}`;

function txIn({
	issuance,
	txid,
	vout,
}: {
	issuance?: boolean;
	txid: string;
	vout: number;
}): string {
	const reversed = (txid.match(/../g) ?? []).toReversed().join("");
	const marked = (issuance ? vout | 0x80_00_00_00 : vout) >>> 0;
	const index = (marked.toString(16).padStart(8, "0").match(/../g) ?? []).toReversed().join("");
	const declared = issuance ? `${"00".repeat(32)}${"aa".repeat(32)}${"01".padEnd(18, "0")}00` : "";

	return `${reversed}${index}00ffffffff${declared}`;
}

function outputBytes(
	scriptHex: string,
	{ asset = ASSET, blinded = false, sats = 1000n } = {},
): string {
	const length = (scriptHex.length / 2).toString(16).padStart(2, "0");

	if (blinded) {
		return `${CONFIDENTIAL_ASSET}${CONFIDENTIAL_VALUE}${NONCE}${length}${scriptHex}`;
	}

	const reversed = (asset.match(/../g) ?? []).toReversed().join("");

	return `01${reversed}01${sats.toString(16).padStart(16, "0")}00${length}${scriptHex}`;
}

const FEE_OUT = outputBytes("", { sats: 300n });
const COVENANT_OUT = outputBytes(COVENANT_SCRIPT, { sats: 50_000n });
const CHANGE_OUT = outputBytes(CHANGE_SCRIPT, { sats: 900n });
const RECEIVED_OUT = outputBytes(WALLET_SCRIPT, { sats: 50_000n });
const COVENANT_TXID = "e".repeat(64);

function signedHex(spends: Parameters<typeof txIn>[0][], outs: string[]): string {
	const inputCount = spends.length.toString(16).padStart(2, "0");
	const outputCount = outs.length.toString(16).padStart(2, "0");

	return `0200000000${inputCount}${spends.map((spend) => txIn(spend)).join("")}${outputCount}${outs.join("")}00000000`;
}

function signed(
	spends: Parameters<typeof txIn>[0][] = [{ txid: "c".repeat(64), vout: 0 }],
	outs: string[] = [COVENANT_OUT, CHANGE_OUT, FEE_OUT],
): AssembledTransaction {
	return { feeSats: 300n, hex: signedHex(spends, outs), txid: "f".repeat(64) };
}

const SIGNED: AssembledTransaction = signed();
const TXOUT_HEX = `01${"49".repeat(32)}0100000000000186a000160014${"00".repeat(20)}`;

type Recorded = {
	changes: { blindingKey: string | null | undefined; script: string }[];
	covenants: {
		argumentsJson: string | undefined;
		extraLeavesJson: string | undefined;
		includeDebugSymbols: boolean | undefined;
		issued?: { assetAmountSats: bigint; inflationAmountSats: bigint };
		signatureWitness: string | undefined;
		source: string;
		txOutHex: string;
		txid: string;
		vout: number;
		witnessJson: string | undefined;
	}[];
	freed: number;
	freedReports: number;
	issues: {
		assetAmountSats: bigint;
		inflationAmountSats: bigint;
		issuerContractHex: string | undefined;
		txOut: string;
		txid: string;
		vout: number;
	}[];
	outputs: {
		asset: string;
		blindingKey: string | null | undefined;
		sats: bigint;
		script: string;
	}[];
	locktimes: number[];
	sequences: number[];
	spends: { txOut: string; txid: string; vout: number }[];
};

const ISSUED = {
	asset: "ce091c998b83c78bb71a632313ba3760f1763d9cfcffae02258ffa9865a37bd2",
	entropy: "a".repeat(64),
	reissuanceToken: "59fe4d2127ba9f16bd6850a3e6271a166e7ed2e1669f6c107d655791c94ee98f",
};

const ISSUANCE_TXID = "c".repeat(64);

const plannedIssuance = () => ({
	asset: ISSUED.asset,
	assetAmountSats: 1000n,
	entropy: ISSUED.entropy,
	inflationAmountSats: 0n,
	inputId: "mint_in",
	kind: "new" as const,
	outpoint: { txid: ISSUANCE_TXID, vout: 0 },
	reissuanceToken: ISSUED.reissuanceToken,
});

function substitute(recorded: Recorded, reports: Partial<typeof ISSUED> = {}): SmplxModule {
	return {
		TransactionBuilder: class {
			addChange(script: string, blindingKey?: string | null) {
				recorded.changes.push({ blindingKey, script });
			}
			addOutput(script: string, sats: bigint, asset: string, blindingKey?: string | null) {
				recorded.outputs.push({ asset, blindingKey, sats, script });
			}
			addWalletInput(txid: string, vout: number, txOut: string) {
				recorded.spends.push({ txOut, txid, vout });
			}
			addWalletIssuanceInput(
				txid: string,
				vout: number,
				txOut: string,
				assetAmountSats: bigint,
				inflationAmountSats: bigint,
				issuerContractHex?: string,
			) {
				recorded.issues.push({
					assetAmountSats,
					inflationAmountSats,
					issuerContractHex,
					txOut,
					txid,
					vout,
				});

				return {
					assetId: reports.asset ?? ISSUED.asset,
					entropy: reports.entropy ?? ISSUED.entropy,
					free: () => {
						recorded.freedReports += 1;
					},
					reissuanceTokenId: reports.reissuanceToken ?? ISSUED.reissuanceToken,
				};
			}
			addCovenantInput(
				txid: string,
				vout: number,
				txOutHex: string,
				source: string,
				argumentsJson?: string,
				witnessJson?: string,
				signatureWitness?: string,
				extraLeavesJson?: string,
				includeDebugSymbols?: boolean,
			) {
				recorded.covenants.push({
					argumentsJson,
					extraLeavesJson,
					includeDebugSymbols,
					signatureWitness,
					source,
					txOutHex,
					txid,
					vout,
					witnessJson,
				});
			}
			addCovenantIssuanceInput(
				txid: string,
				vout: number,
				txOutHex: string,
				source: string,
				argumentsJson: string | undefined,
				witnessJson: string | undefined,
				signatureWitness: string | undefined,
				assetAmountSats: bigint,
				inflationAmountSats: bigint,
				_issuerContractHex: string | undefined,
				extraLeavesJson?: string,
				includeDebugSymbols?: boolean,
			) {
				recorded.covenants.push({
					argumentsJson,
					extraLeavesJson,
					includeDebugSymbols,
					issued: { assetAmountSats, inflationAmountSats },
					signatureWitness,
					source,
					txOutHex,
					txid,
					vout,
					witnessJson,
				});

				return {
					assetId: reports.asset ?? ISSUED.asset,
					entropy: reports.entropy ?? ISSUED.entropy,
					free: () => {
						recorded.freedReports += 1;
					},
					reissuanceTokenId: reports.reissuanceToken ?? ISSUED.reissuanceToken,
				};
			}
			setLocktimeHeight(height: number) {
				recorded.locktimes.push(height);
			}
			setSequence(sequence: number) {
				recorded.sequences.push(sequence);
			}
			free() {
				recorded.freed += 1;
			}
		},
	};
}

type SmplxModule = { TransactionBuilder: new () => AssemblingBuilder };

const WALLET_UTXO = {
	amount: "1000000",
	spendable: true,
	txOut: TXOUT_HEX,
	txid: "c".repeat(64),
	vout: 0,
};

function review(overrides: Partial<ManifestReview> = {}): ManifestReview {
	const built = plan(overrides);

	return overrides.inputOrder === undefined
		? {
				...built,
				inputOrder: [
					...built.covenantInputs.map((covenant) => ({ covenant, source: "covenant" as const })),
					...built.selected.map((utxo) => ({ source: "wallet" as const, utxo })),
				],
			}
		: built;
}

function plan(overrides: Partial<ManifestReview> = {}): ManifestReview {
	return {
		action: "Pay",
		confirmation: {
			account: computed("liquid:testnet account 0"),
			action: fromDapp("Pay"),
			covenants: [],
			feeAsset: computed(ASSET),
			feeSats: computed(344n),
			blindedAmounts: [],
			netEffect: [{ asset: computed(ASSET), sats: computed(-50_344n) }],
			protocol: fromDapp("p2pk-simplicity"),
			publishedAmounts: [],
		},
		covenantInputs: [],
		inputOrder: [{ source: "wallet", utxo: WALLET_UTXO }],
		covenants: [
			{
				address: "tex1p_derived",
				...COVENANT_BUILD,
				role: "created",
				scriptPubKeyHex: COVENANT_SCRIPT,
				utxoType: "p2pk_output",
				verified: "not-yet-onchain",
			},
		],
		changeBlinded: false,
		changeOverrode: "chain",
		estimatedFeeSats: 344n,
		feeRateSatsPerKvb: 1000,
		issuances: [],
		movements: [{ asset: ASSET, sats: -50_344n }],
		normalisation: [],
		outputs: [
			{
				asset: ASSET,
				blinded: false,
				decidedBy: "unblindable",
				id: "p2pk_out",
				sats: 50_000n,
				scriptPubKeyHex: COVENANT_SCRIPT,
			},
		],
		policyAsset: ASSET,
		protocol: "p2pk-simplicity",
		selected: [WALLET_UTXO],
		...overrides,
	};
}

function subject(
	overrides: Partial<ManifestReview> = {},
	finalize = () => SIGNED,
	extra: { blindingPublicKeyHex?: string; reports?: Partial<typeof ISSUED> } = {},
) {
	const recorded: Recorded = {
		changes: [],
		covenants: [],
		freed: 0,
		freedReports: 0,
		issues: [],
		locktimes: [],
		outputs: [],
		sequences: [],
		spends: [],
	};

	return {
		assemble: () =>
			assembleReviewedTransaction(review(overrides), {
				...(extra.blindingPublicKeyHex === undefined
					? {}
					: { blindingPublicKeyHex: extra.blindingPublicKeyHex }),
				changeScriptPubKeyHex: CHANGE_SCRIPT,
				finalize,
				smplx: substitute(recorded, extra.reports),
			}),
		recorded,
	};
}

describe("assembleReviewedTransaction", () => {
	test("spends exactly the wallet outputs the review selected, with what each holds", async () => {
		const { assemble, recorded } = subject();

		await assemble();

		expect(recorded.spends).toEqual([{ txOut: TXOUT_HEX, txid: "c".repeat(64), vout: 0 }]);
	});

	test("pays exactly the outputs the review planned, in the asset it worked out", async () => {
		const { assemble, recorded } = subject();

		await assemble();

		expect(recorded.outputs).toEqual([
			{ asset: ASSET, blindingKey: undefined, sats: 50_000n, script: COVENANT_SCRIPT },
		]);
	});

	test("every output script is hex the builder can decode", async () => {
		const { assemble, recorded } = subject();

		await assemble();

		expect(recorded.outputs.length).toBeGreaterThan(0);

		for (const output of recorded.outputs) {
			expect(output.script).toMatch(/^(?:[0-9a-fA-F]{2})+$/);
		}
	});

	test("returns change to the script the caller named, and to nothing else", async () => {
		const { assemble, recorded } = subject();

		await assemble();

		expect(recorded.changes).toEqual([{ blindingKey: undefined, script: CHANGE_SCRIPT }]);
	});

	test("passes no blinding key with the change", async () => {
		const { assemble, recorded } = subject();

		await assemble();

		expect(recorded.changes[0]?.blindingKey).toBeUndefined();
	});

	test("hands the finalizer the rate the review established, and returns what it made", async () => {
		const rates: number[] = [];
		const { assemble } = subject({}, ((_builder: AssemblingBuilder, rate: number) => {
			rates.push(rate);

			return SIGNED;
		}) as () => AssembledTransaction);

		const result = await assemble();

		expect(rates).toEqual([1000]);
		expect(result).toEqual({ ok: true, transaction: SIGNED });
	});

	test("signs nothing itself: the finalizer is the only thing that finishes a transaction", async () => {
		let finalized = 0;
		const { assemble } = subject({}, () => {
			finalized += 1;

			return SIGNED;
		});

		await assemble();

		expect(finalized).toBe(1);
	});

	describe("what it releases", () => {
		test("releases the builder once the transaction is finished", async () => {
			const { assemble, recorded } = subject();

			await assemble();

			expect(recorded.freed).toBe(1);
		});

		test("releases the builder when the finalizer fails", async () => {
			const { assemble, recorded } = subject({}, () => {
				throw new Error("could not balance");
			});

			const result = await assemble();

			expect(result).toMatchObject({ ok: false });
			expect(recorded.freed).toBe(1);

			if (!result.ok) {
				expect(result.reason).toContain("could not balance");
			}
		});

		test("releases the builder when an output the module will not take throws", async () => {
			const recorded: Recorded = {
				changes: [],
				covenants: [],
				freed: 0,
				freedReports: 0,
				issues: [],
				locktimes: [],
				outputs: [],
				sequences: [],
				spends: [],
			};
			const smplx = substitute(recorded);

			smplx.TransactionBuilder.prototype.addOutput = () => {
				throw new Error("Invalid script: Odd number of digits");
			};

			const result = await assembleReviewedTransaction(review(), {
				changeScriptPubKeyHex: CHANGE_SCRIPT,
				finalize: () => SIGNED,
				smplx,
			});

			expect(result).toMatchObject({ ok: false });
			expect(recorded.freed).toBe(1);
		});

		test("releases the builder when the change script is refused", async () => {
			const recorded: Recorded = {
				changes: [],
				covenants: [],
				freed: 0,
				freedReports: 0,
				issues: [],
				locktimes: [],
				outputs: [],
				sequences: [],
				spends: [],
			};
			let finalized = 0;
			const smplx = substitute(recorded);

			smplx.TransactionBuilder.prototype.addChange = () => {
				throw new Error("Invalid script: Odd number of digits");
			};

			const result = await assembleReviewedTransaction(review(), {
				changeScriptPubKeyHex: "tex1q_wallet",
				finalize: () => {
					finalized += 1;

					return SIGNED;
				},
				smplx,
			});

			expect(result).toMatchObject({ ok: false });
			expect(recorded.freed).toBe(1);
			expect(finalized).toBe(0);
		});
	});

	describe("an action that spends a covenant", () => {
		const covenantInput = {
			argumentsJson: COVENANT_BUILD.argumentsJson,
			extraLeavesJson: COVENANT_BUILD.extraLeavesJson,
			id: "p2pk_in",
			includeDebugSymbols: COVENANT_BUILD.includeDebugSymbols,
			signatureWitness: "SIGNATURE",
			source: COVENANT_BUILD.source,
			txOutHex: TXOUT_HEX,
			txid: COVENANT_TXID,
			utxoType: "p2pk_output",
			vout: 1,
		};
		const spendingPlan = (overrides: Partial<ManifestReview> = {}): Partial<ManifestReview> => ({
			action: "Receive",
			covenantInputs: [covenantInput],
			covenants: [
				{
					address: "tex1p_derived",
					...COVENANT_BUILD,
					role: "spent",
					scriptPubKeyHex: COVENANT_SCRIPT,
					utxoType: "p2pk_output",
					verified: "matches-chain",
				},
			],
			outputs: [
				{
					asset: ASSET,
					blinded: false,
					decidedBy: "unblindable",
					id: "received_out",
					sats: 50_000n,
					scriptPubKeyHex: WALLET_SCRIPT,
				},
			],
			...overrides,
		});
		const spent = () =>
			signed(
				[
					{ txid: COVENANT_TXID, vout: 1 },
					{ txid: "c".repeat(64), vout: 0 },
				],
				[RECEIVED_OUT, CHANGE_OUT, FEE_OUT],
			);

		test("hands the module everything the review verified the covenant under", async () => {
			const { assemble, recorded } = subject(spendingPlan(), spent);

			expect(await assemble()).toMatchObject({ ok: true });
			expect(recorded.covenants).toEqual([
				{
					argumentsJson: COVENANT_BUILD.argumentsJson,
					extraLeavesJson: "[]",
					includeDebugSymbols: false,
					signatureWitness: "SIGNATURE",
					source: COVENANT_BUILD.source,
					txOutHex: TXOUT_HEX,
					txid: COVENANT_TXID,
					vout: 1,
					witnessJson: undefined,
				},
			]);
		});

		test("passes the stated witness values through as the compiler's own shape", async () => {
			const { assemble, recorded } = subject(
				spendingPlan({
					covenantInputs: [
						{
							...covenantInput,
							witnessValues: [
								{ name: "BRANCH", simplicityType: "Either<(), ()>", value: "Left(())" },
							],
						},
					],
				}),
				spent,
			);

			expect(await assemble()).toMatchObject({ ok: true });
			expect(recorded.covenants[0]?.witnessJson).toBe(
				JSON.stringify({ BRANCH: { type: "Either<(), ()>", value: "Left(())" } }),
			);
		});

		test("asks for no signature where the document declares none", async () => {
			const { assemble, recorded } = subject(
				spendingPlan({
					covenantInputs: [{ ...covenantInput, signatureWitness: undefined }],
				}),
				spent,
			);

			expect(await assemble()).toMatchObject({ ok: true });
			expect(recorded.covenants[0]?.signatureWitness).toBeUndefined();
		});

		test("adds the inputs in the order the plan states, not covenants first", async () => {
			const { assemble, recorded } = subject(
				spendingPlan({
					inputOrder: [
						{ source: "wallet", utxo: WALLET_UTXO },
						{ covenant: covenantInput, source: "covenant" },
					],
				}),
				() =>
					signed(
						[
							{ txid: "c".repeat(64), vout: 0 },
							{ txid: COVENANT_TXID, vout: 1 },
						],
						[RECEIVED_OUT, CHANGE_OUT, FEE_OUT],
					),
			);

			expect(await assemble()).toMatchObject({ ok: true });
			expect(recorded.spends).toHaveLength(1);
			expect(recorded.covenants).toHaveLength(1);
		});

		test("builds an action funded entirely by the covenant it spends", async () => {
			const { assemble, recorded } = subject(
				spendingPlan({
					inputOrder: [{ covenant: covenantInput, source: "covenant" }],
					selected: [],
				}),
				() => signed([{ txid: COVENANT_TXID, vout: 1 }], [RECEIVED_OUT, CHANGE_OUT, FEE_OUT]),
			);

			expect(await assemble()).toMatchObject({ ok: true });
			expect(recorded.spends).toEqual([]);
			expect(recorded.covenants).toHaveLength(1);
		});

		test("refuses when there is nothing funding it at all", async () => {
			const { assemble } = subject(spendingPlan({ inputOrder: [], selected: [] }));

			expect(await assemble()).toMatchObject({ ok: false });
		});

		test("declares the locktime and the sequence the plan carries", async () => {
			const { assemble, recorded } = subject(
				spendingPlan({ locktimeHeight: 3_210_987, sequence: 4_294_967_294 }),
				spent,
			);

			expect(await assemble()).toMatchObject({ ok: true });
			expect(recorded.locktimes).toEqual([3_210_987]);
			expect(recorded.sequences).toEqual([4_294_967_294]);
		});

		test("declares neither where the plan carries neither", async () => {
			const { assemble, recorded } = subject(spendingPlan(), spent);

			await assemble();

			expect(recorded.locktimes).toEqual([]);
			expect(recorded.sequences).toEqual([]);
		});

		test("releases the builder whatever the module hands back", async () => {
			const { assemble, recorded } = subject(spendingPlan(), () =>
				signed([{ txid: "c".repeat(64), vout: 0 }], [RECEIVED_OUT, CHANGE_OUT, FEE_OUT]),
			);

			await assemble();

			expect(recorded.freed).toBe(1);
		});

		test("adds a covenant that also issues exactly once, through the one call that does both", async () => {
			const { assemble, recorded } = subject(
				spendingPlan({
					issuances: [{ ...plannedIssuance(), outpoint: { txid: COVENANT_TXID, vout: 1 } }],
				}),
				() =>
					signed(
						[
							{ issuance: true, txid: COVENANT_TXID, vout: 1 },
							{ txid: "c".repeat(64), vout: 0 },
						],
						[RECEIVED_OUT, CHANGE_OUT, FEE_OUT],
					),
			);

			expect(await assemble()).toMatchObject({ ok: true });
			expect(recorded.covenants).toHaveLength(1);
			expect(recorded.covenants[0]?.issued).toEqual({
				assetAmountSats: 1000n,
				inflationAmountSats: 0n,
			});
			expect(recorded.issues).toEqual([]);
			expect(recorded.freedReports).toBe(1);
		});
	});

	describe("what it will not build", () => {
		test("refuses when nothing of the wallet's funds it", async () => {
			const { assemble } = subject({ selected: [] });

			expect(await assemble()).toMatchObject({ ok: false });
		});

		test("refuses when there is nothing to pay", async () => {
			const { assemble } = subject({ outputs: [] });

			expect(await assemble()).toMatchObject({ ok: false });
		});

		test("builds nothing at all when it refuses", async () => {
			const { assemble, recorded } = subject({ selected: [] });

			await assemble();

			expect(recorded.freed).toBe(0);
			expect(recorded.outputs).toEqual([]);
		});
	});

	test("pays a wallet output the script the review derived", async () => {
		const { assemble, recorded } = subject({
			outputs: [
				{
					asset: ASSET,
					blinded: false,
					decidedBy: "output",
					id: "received_out",
					sats: 10n,
					scriptPubKeyHex: WALLET_SCRIPT,
				},
			],
		});

		await assemble();

		expect(recorded.outputs).toEqual([
			{ asset: ASSET, blindingKey: undefined, sats: 10n, script: WALLET_SCRIPT },
		]);
	});

	describe("an input that creates an asset", () => {
		const issuing = { issuances: [plannedIssuance()] };

		test("is added as an issuance, with the amounts the review resolved", async () => {
			const { assemble, recorded } = subject(issuing);

			await assemble();

			expect(recorded.issues).toEqual([
				{
					assetAmountSats: 1000n,
					inflationAmountSats: 0n,
					issuerContractHex: undefined,
					txOut: TXOUT_HEX,
					txid: ISSUANCE_TXID,
					vout: 0,
				},
			]);
		});

		test("and is not also added as an ordinary wallet input", async () => {
			const { assemble, recorded } = subject(issuing);

			await assemble();

			expect(recorded.spends).toEqual([]);
		});

		test("while the wallet's other outputs are added as they were", async () => {
			const { assemble, recorded } = subject({
				...issuing,
				selected: [
					{ amount: "1000000", spendable: true, txOut: TXOUT_HEX, txid: ISSUANCE_TXID, vout: 0 },
					{ amount: "2000", spendable: true, txOut: TXOUT_HEX, txid: "d".repeat(64), vout: 3 },
				],
			});

			await assemble();

			expect(recorded.issues).toHaveLength(1);
			expect(recorded.spends).toEqual([{ txOut: TXOUT_HEX, txid: "d".repeat(64), vout: 3 }]);
		});

		test("releases the module's report", async () => {
			const { assemble, recorded } = subject(issuing);

			expect(await assemble()).toMatchObject({ ok: true });
			expect(recorded.freedReports).toBe(1);
		});

		describe("what it settles before starting a builder", () => {
			test("an issuance derived from an output this transaction does not spend", async () => {
				const { assemble, recorded } = subject({
					issuances: [{ ...plannedIssuance(), outpoint: { txid: "e".repeat(64), vout: 7 } }],
				});

				const result = await assemble();

				expect(result).toMatchObject({ ok: false });
				expect(recorded.freed).toBe(0);
				expect(recorded.spends).toEqual([]);
				expect(recorded.issues).toEqual([]);

				if (!result.ok) {
					expect(result.reason).toContain("mint_in");
				}
			});

			test("two issuances derived from one output", async () => {
				const { assemble, recorded } = subject({
					issuances: [
						plannedIssuance(),
						{ ...plannedIssuance(), asset: "b".repeat(64), inputId: "mint_two" },
					],
				});

				const result = await assemble();

				expect(result).toMatchObject({ ok: false });
				expect(recorded.freed).toBe(0);
				expect(recorded.issues).toEqual([]);

				if (!result.ok) {
					expect(result.reason).toContain("mint_two");
					expect(result.reason).toContain("cannot create two assets");
				}
			});

			test("one of the wallet's outputs selected more than once", async () => {
				const spent = {
					amount: "1000000",
					spendable: true,
					txOut: TXOUT_HEX,
					txid: ISSUANCE_TXID,
					vout: 0,
				};
				const { assemble, recorded } = subject({ selected: [spent, { ...spent }] });

				const result = await assemble();

				expect(result).toMatchObject({ ok: false });
				expect(recorded.freed).toBe(0);
				expect(recorded.spends).toEqual([]);

				if (!result.ok) {
					expect(result.reason).toContain("more than once");
				}
			});

			test("and the same output written in two cases", async () => {
				const spent = {
					amount: "1000000",
					spendable: true,
					txOut: TXOUT_HEX,
					txid: ISSUANCE_TXID,
					vout: 0,
				};
				const { assemble, recorded } = subject({
					selected: [spent, { ...spent, txid: ISSUANCE_TXID.toUpperCase() }],
				});

				expect(await assemble()).toMatchObject({ ok: false });
				expect(recorded.freed).toBe(0);
			});
		});
	});

	describe("blinding", () => {
		const BLINDING_KEY = `02${"55".repeat(32)}`;
		const blindedAndOpen = {
			outputs: [
				{
					asset: ASSET,
					blinded: true,
					decidedBy: "chain" as const,
					id: "paid_out",
					sats: 10n,
					scriptPubKeyHex: WALLET_SCRIPT,
				},
				{
					asset: ASSET,
					blinded: false,
					decidedBy: "unblindable" as const,
					id: "p2pk_out",
					sats: 50_000n,
					scriptPubKeyHex: COVENANT_SCRIPT,
				},
			],
		};

		test("passes the key only to the outputs the review says are blinded", async () => {
			const { assemble, recorded } = subject(blindedAndOpen, () => SIGNED, {
				blindingPublicKeyHex: BLINDING_KEY,
			});

			await assemble();

			expect(recorded.outputs).toEqual([
				{ asset: ASSET, blindingKey: BLINDING_KEY, sats: 10n, script: WALLET_SCRIPT },
				{ asset: ASSET, blindingKey: undefined, sats: 50_000n, script: COVENANT_SCRIPT },
			]);
		});

		test("passes no key for change the review returns in the open", async () => {
			const { assemble, recorded } = subject({}, () => SIGNED, {
				blindingPublicKeyHex: BLINDING_KEY,
			});

			await assemble();

			expect(recorded.changes).toEqual([{ blindingKey: undefined, script: CHANGE_SCRIPT }]);
		});

		test("and passes it for change the review says must be blinded", async () => {
			const { assemble, recorded } = subject({ changeBlinded: true }, () => SIGNED, {
				blindingPublicKeyHex: BLINDING_KEY,
			});

			await assemble();

			expect(recorded.changes).toEqual([{ blindingKey: BLINDING_KEY, script: CHANGE_SCRIPT }]);
		});

		test("refuses a blinded output it was given no key for, building nothing", async () => {
			const { assemble, recorded } = subject(blindedAndOpen);

			const result = await assemble();

			expect(result).toMatchObject({ ok: false });
			expect(recorded.freed).toBe(0);
			expect(recorded.outputs).toEqual([]);

			if (!result.ok) {
				expect(result.reason).toContain("paid_out");
			}
		});

		test("and refuses blinded change it was given no key for", async () => {
			expect(await subject({ changeBlinded: true }).assemble()).toMatchObject({ ok: false });
		});
	});
});
