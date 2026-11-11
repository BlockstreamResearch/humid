import { describe, expect, test } from "bun:test";

import { type ManifestReview, Refusal, computed, fromDapp } from "@humid/tx-manifest";

import { type AssemblingBuilder, assembleReviewedTransaction } from "./assembleReviewedTransaction";

const PROGRAM_SCRIPT = `5120${"11".repeat(32)}`;
const PROGRAM_BUILD = {
	argumentsJson: '{"PUB_KEY":{"type":"Pubkey","value":"0x00"}}',
	cmr: "cc".repeat(32),
	extraLeavesJson: "[]",
	includeDebugSymbols: false,
	source: "fn main() { }",
	sourcePath: "./p2pk.simf",
	tapleafHash: "1e".repeat(32),
};
const WALLET_SCRIPT = `0014${"33".repeat(20)}`;
const ASSET = "144c654344aa716d6f3abcc1ca90e5641e4e2a7f633bc09fe3baf64585819a49";
const PROGRAM_TXID = "e".repeat(64);
const SIGNING_PATH = "0/0";
const BLINDING_KEY = `02${"55".repeat(32)}`;
const SIGNED = { feeSats: 300n, hex: "00", txid: "f".repeat(64) };
const TXOUT_HEX = `01${"49".repeat(32)}0100000000000186a000160014${"00".repeat(20)}`;

type Recorded = {
	programs: {
		argumentsJson: string | undefined;
		derivationPath: string | undefined;
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
		blindingSecretsJson: string | undefined;
		derivationPath: string | undefined;
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
	sequences: { inputIndex: number; sequence: number }[];
	reissues: { assetAmountSats: bigint; entropy: string; txid: string; vout: number }[];
	spends: { txOut: string; txid: string; vout: number }[];
	unused: { inputIndex: number; names: string[] }[];
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
			addOutput(script: string, sats: bigint, asset: string, blindingKey?: string | null) {
				recorded.outputs.push({ asset, blindingKey, sats, script });
			}
			addInput(txid: string, vout: number, txOut: string) {
				recorded.spends.push({ txOut, txid, vout });
			}
			addIssuanceInput(
				txid: string,
				vout: number,
				txOut: string,
				assetAmountSats: bigint,
				inflationAmountSats: bigint,
				issuerContractHex?: string,
				blindingSecretsJson?: string,
				derivationPath?: string,
			) {
				recorded.issues.push({
					assetAmountSats,
					blindingSecretsJson,
					derivationPath,
					inflationAmountSats,
					issuerContractHex,
					txOut,
					txid,
					vout,
				});

				return {
					assetId: reports.asset ?? ISSUED.asset,
					assetEntropy: reports.entropy ?? ISSUED.entropy,
					free: () => {
						recorded.freedReports += 1;
					},
					inflationAssetId: reports.reissuanceToken ?? ISSUED.reissuanceToken,
				};
			}
			addReissuanceInput(
				txid: string,
				vout: number,
				_txOut: string,
				assetAmountSats: bigint,
				entropy: string,
			) {
				recorded.reissues.push({ assetAmountSats, entropy, txid, vout });

				return {
					assetId: reports.asset ?? ISSUED.asset,
					assetEntropy: entropy,
					free: () => {
						recorded.freedReports += 1;
					},
					inflationAssetId: reports.reissuanceToken ?? ISSUED.reissuanceToken,
				};
			}
			addProgramInput(
				txid: string,
				vout: number,
				txOutHex: string,
				source: string,
				argumentsJson?: string,
				witnessJson?: string,
				signatureWitness?: string,
				extraLeavesJson?: string,
				includeDebugSymbols?: boolean,
				derivationPath?: string,
			) {
				recorded.programs.push({
					argumentsJson,
					derivationPath,
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
			addProgramIssuanceInput(
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
				derivationPath?: string,
			) {
				recorded.programs.push({
					argumentsJson,
					derivationPath,
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
					assetEntropy: reports.entropy ?? ISSUED.entropy,
					free: () => {
						recorded.freedReports += 1;
					},
					inflationAssetId: reports.reissuanceToken ?? ISSUED.reissuanceToken,
				};
			}
			setLocktimeHeight(height: number) {
				recorded.locktimes.push(height);
			}
			setInputSequence(inputIndex: number, sequence: number) {
				recorded.sequences.push({ inputIndex, sequence });
			}
			setUnusedWitnesses(inputIndex: number, names: string[]) {
				recorded.unused.push({ inputIndex, names });
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
					...built.programInputs.map((program) => ({ program, source: "program" as const })),
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
			programs: [],
			feeAsset: computed(ASSET),
			feeSats: computed(344n),
			blindedAmounts: [],
			netEffect: [{ asset: computed(ASSET), sats: computed(-50_344n) }],
			payments: [],
			protocol: fromDapp("p2pk-simplicity"),
			publishedAmounts: [],
		},
		programInputs: [],
		inputOrder: [{ source: "wallet", utxo: WALLET_UTXO }],
		programs: [
			{
				address: "tex1p_derived",
				...PROGRAM_BUILD,
				role: "created",
				scriptPubKeyHex: PROGRAM_SCRIPT,
				utxoType: "p2pk_output",
				verified: "not-yet-onchain",
			},
		],
		estimatedFeeSats: 344n,
		feeRateSatsPerKvb: 1000,
		issuances: [],
		movements: [{ asset: ASSET, sats: -50_344n }],
		outputs: [
			{
				asset: ASSET,
				blinded: false,
				decidedBy: "unblindable",
				id: "p2pk_out",
				sats: 50_000n,
				scriptPubKeyHex: PROGRAM_SCRIPT,
			},
		],
		policyAsset: ASSET,
		protocol: "p2pk-simplicity",
		selected: [WALLET_UTXO],
		...overrides,
	};
}

function emptyRecord(): Recorded {
	return {
		programs: [],
		freed: 0,
		freedReports: 0,
		issues: [],
		locktimes: [],
		outputs: [],
		sequences: [],
		reissues: [],
		spends: [],
		unused: [],
	};
}

type Attempt = { ok: false; reason: string; reject: string } | { ok: true; transaction: unknown };

function attempt(run: () => unknown): Attempt {
	try {
		return { ok: true, transaction: run() };
	} catch (error) {
		if (error instanceof Refusal) {
			return { ok: false, reason: error.reason, reject: error.reject };
		}

		throw error;
	}
}

function subject(
	overrides: Partial<ManifestReview> = {},
	finish: (builder: AssemblingBuilder) => unknown = () => SIGNED,
	extra: { blindingPublicKeyHex?: string; reports?: Partial<typeof ISSUED> } = {},
) {
	const recorded = emptyRecord();

	return {
		assemble: async () =>
			attempt(() =>
				assembleReviewedTransaction(
					review(overrides),
					{
						blindingPublicKeyHex: extra.blindingPublicKeyHex ?? BLINDING_KEY,
						signingDerivationPath: SIGNING_PATH,
						smplx: substitute(recorded, extra.reports),
					},
					finish,
				),
			),
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
			{ asset: ASSET, blindingKey: undefined, sats: 50_000n, script: PROGRAM_SCRIPT },
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

	test("hands the finisher the builder it assembled, and returns what the finisher made", async () => {
		const handed: AssemblingBuilder[] = [];
		const { assemble } = subject({}, (builder) => {
			handed.push(builder);

			return SIGNED;
		});

		expect(await assemble()).toEqual({ ok: true, transaction: SIGNED });
		expect(handed).toHaveLength(1);
	});

	test("signs nothing itself: the finisher is the only thing that finishes a transaction", async () => {
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

		test("releases the builder when the finisher fails", async () => {
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
			const recorded = emptyRecord();
			const smplx = substitute(recorded);

			smplx.TransactionBuilder.prototype.addOutput = () => {
				throw new Error("Invalid script: Odd number of digits");
			};

			const result = attempt(() =>
				assembleReviewedTransaction(
					review(),
					{ blindingPublicKeyHex: BLINDING_KEY, signingDerivationPath: SIGNING_PATH, smplx },
					() => SIGNED,
				),
			);

			expect(result).toMatchObject({ ok: false, reject: "built-something-else" });
			expect(recorded.freed).toBe(1);
		});
	});

	describe("an action that spends a program", () => {
		const programInput = {
			argumentsJson: PROGRAM_BUILD.argumentsJson,
			extraLeavesJson: PROGRAM_BUILD.extraLeavesJson,
			id: "p2pk_in",
			includeDebugSymbols: PROGRAM_BUILD.includeDebugSymbols,
			signatureWitness: "SIGNATURE",
			source: PROGRAM_BUILD.source,
			txOutHex: TXOUT_HEX,
			txid: PROGRAM_TXID,
			utxoType: "p2pk_output",
			vout: 1,
		};
		const spendingPlan = (overrides: Partial<ManifestReview> = {}): Partial<ManifestReview> => ({
			action: "Receive",
			programInputs: [programInput],
			programs: [
				{
					address: "tex1p_derived",
					...PROGRAM_BUILD,
					role: "spent",
					scriptPubKeyHex: PROGRAM_SCRIPT,
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
		const spent = () => SIGNED;

		test("hands the module everything the review verified the program under", async () => {
			const { assemble, recorded } = subject(spendingPlan(), spent);

			expect(await assemble()).toMatchObject({ ok: true });
			expect(recorded.programs).toEqual([
				{
					argumentsJson: PROGRAM_BUILD.argumentsJson,
					derivationPath: SIGNING_PATH,
					extraLeavesJson: "[]",
					includeDebugSymbols: false,
					signatureWitness: "SIGNATURE",
					source: PROGRAM_BUILD.source,
					txOutHex: TXOUT_HEX,
					txid: PROGRAM_TXID,
					vout: 1,
					witnessJson: undefined,
				},
			]);
		});

		test("passes the stated witness values through as the compiler's own shape", async () => {
			const { assemble, recorded } = subject(
				spendingPlan({
					programInputs: [
						{
							...programInput,
							witnessValues: [
								{ name: "BRANCH", simplicityType: "Either<(), ()>", value: "Left(())" },
							],
						},
					],
				}),
				spent,
			);

			expect(await assemble()).toMatchObject({ ok: true });
			expect(recorded.programs[0]?.witnessJson).toBe(
				JSON.stringify({ BRANCH: { type: "Either<(), ()>", value: "Left(())" } }),
			);
		});

		test("signs the program with the wallet's signing key, not the signer's default", async () => {
			const { assemble, recorded } = subject(spendingPlan(), spent);

			expect(await assemble()).toMatchObject({ ok: true });
			expect(recorded.programs.map((program) => program.derivationPath)).toEqual([SIGNING_PATH]);
		});

		test("asks for no signature where the document declares none", async () => {
			const { assemble, recorded } = subject(
				spendingPlan({
					programInputs: [{ ...programInput, signatureWitness: undefined }],
				}),
				spent,
			);

			expect(await assemble()).toMatchObject({ ok: true });
			expect(recorded.programs[0]?.signatureWitness).toBeUndefined();
		});

		test("adds the inputs in the order the plan states, not programs first", async () => {
			const { assemble, recorded } = subject(
				spendingPlan({
					inputOrder: [
						{ source: "wallet", utxo: WALLET_UTXO },
						{ program: programInput, source: "program" },
					],
				}),
				() => SIGNED,
			);

			expect(await assemble()).toMatchObject({ ok: true });
			expect(recorded.spends).toHaveLength(1);
			expect(recorded.programs).toHaveLength(1);
		});

		test("builds an action funded entirely by the program it spends", async () => {
			const { assemble, recorded } = subject(
				spendingPlan({
					inputOrder: [{ program: programInput, source: "program" }],
					selected: [],
				}),
				() => SIGNED,
			);

			expect(await assemble()).toMatchObject({ ok: true });
			expect(recorded.spends).toEqual([]);
			expect(recorded.programs).toHaveLength(1);
		});

		test("refuses when there is nothing funding it at all", async () => {
			const { assemble } = subject(spendingPlan({ inputOrder: [], selected: [] }));

			expect(await assemble()).toMatchObject({ ok: false });
		});

		test("zero-fills the witnesses the spend leaves unused, at the program's own input", async () => {
			const { assemble, recorded } = subject(
				spendingPlan({
					inputOrder: [
						{ source: "wallet", utxo: WALLET_UTXO },
						{ program: { ...programInput, unusedWitnesses: ["HOT_SIG"] }, source: "program" },
					],
				}),
			);

			expect(await assemble()).toMatchObject({ ok: true });
			expect(recorded.unused).toEqual([{ inputIndex: 1, names: ["HOT_SIG"] }]);
		});

		test("leaves every witness as stated where the spend uses them all", async () => {
			const { assemble, recorded } = subject(spendingPlan());

			await assemble();

			expect(recorded.unused).toEqual([]);
		});

		test("declares the locktime the plan carries, and each input's own sequence", async () => {
			const { assemble, recorded } = subject(
				spendingPlan({
					inputOrder: [
						{ source: "wallet", utxo: WALLET_UTXO },
						{ program: programInput, sequence: 25_920, source: "program" },
					],
					locktimeHeight: 3_210_987,
				}),
				spent,
			);

			expect(await assemble()).toMatchObject({ ok: true });
			expect(recorded.locktimes).toEqual([3_210_987]);
			expect(recorded.sequences).toEqual([{ inputIndex: 1, sequence: 25_920 }]);
		});

		test("declares neither where the plan carries neither", async () => {
			const { assemble, recorded } = subject(spendingPlan(), spent);

			await assemble();

			expect(recorded.locktimes).toEqual([]);
			expect(recorded.sequences).toEqual([]);
		});

		test("releases the builder whatever the module hands back", async () => {
			const { assemble, recorded } = subject(spendingPlan(), () => SIGNED);

			await assemble();

			expect(recorded.freed).toBe(1);
		});

		test("adds a program that also issues exactly once, through the one call that does both", async () => {
			const { assemble, recorded } = subject(
				spendingPlan({
					issuances: [{ ...plannedIssuance(), outpoint: { txid: PROGRAM_TXID, vout: 1 } }],
				}),
				() => SIGNED,
			);

			expect(await assemble()).toMatchObject({ ok: true });
			expect(recorded.programs).toHaveLength(1);
			expect(recorded.programs[0]?.derivationPath).toBe(SIGNING_PATH);
			expect(recorded.programs[0]?.issued).toEqual({
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

		test("reissues through the module's own call, handing it the entropy in the module's byte order", async () => {
			const token = {
				...WALLET_UTXO,
				blindingSecretsJson: '{"value":1}',
				confidential: true,
				derivationPath: "0/3",
				txid: ISSUANCE_TXID,
			};
			const { assemble, recorded } = subject({
				issuances: [{ ...plannedIssuance(), entropy: `01${"00".repeat(31)}`, kind: "reissue" }],
				selected: [token],
			});

			expect(await assemble()).toMatchObject({ ok: true });
			expect(recorded.reissues).toEqual([
				{ assetAmountSats: 1000n, entropy: `${"00".repeat(31)}01`, txid: ISSUANCE_TXID, vout: 0 },
			]);
			expect(recorded.issues).toEqual([]);
			expect(recorded.freedReports).toBe(1);
		});

		test("is added as an issuance, with the amounts the review resolved", async () => {
			const { assemble, recorded } = subject(issuing);

			await assemble();

			expect(recorded.issues).toEqual([
				{
					assetAmountSats: 1000n,
					blindingSecretsJson: undefined,
					derivationPath: undefined,
					inflationAmountSats: 0n,
					issuerContractHex: undefined,
					txOut: TXOUT_HEX,
					txid: ISSUANCE_TXID,
					vout: 0,
				},
			]);
		});

		test("spends a blinded output with what it unblinds to and the key that signs it", async () => {
			const secrets = '{"asset":"00","value":1000000}';
			const { assemble, recorded } = subject({
				...issuing,
				selected: [
					{
						...WALLET_UTXO,
						blindingSecretsJson: secrets,
						confidential: true,
						derivationPath: "0/7",
					},
				],
			});

			expect(await assemble()).toMatchObject({ ok: true });
			expect(recorded.issues[0]).toMatchObject({
				blindingSecretsJson: secrets,
				derivationPath: "0/7",
			});
		});

		test("refuses a blinded output it was not told the signing key of", async () => {
			const { assemble, recorded } = subject({
				...issuing,
				selected: [{ ...WALLET_UTXO, blindingSecretsJson: '{"value":1}', confidential: true }],
			});

			expect(await assemble()).toMatchObject({ ok: false, reject: "built-something-else" });
			expect(recorded.issues).toEqual([]);
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
					scriptPubKeyHex: PROGRAM_SCRIPT,
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
				{ asset: ASSET, blindingKey: undefined, sats: 50_000n, script: PROGRAM_SCRIPT },
			]);
		});
	});
});
