import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";

import { SMPLX_COMPILER_VERSION } from "@humid/smplx-compiler";
import {
	type EstimateFee,
	isRefusal,
	type ManifestReview,
	type ParsedLiquidProcessCtParams,
	reviewManifestAction,
	type SelectableUtxo,
	type TransactionDraft,
} from "@humid/tx-manifest";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { hexToBytes } from "@noble/hashes/utils.js";

import { lwk } from "../lwk/lwkWasmForTests";
import { addressReader } from "../lwk/wallet/readAddress";
import { walletUnblinder } from "../lwk/wallet/walletUnblinder";
import { assembleReviewedTransaction } from "./assembleReviewedTransaction";
import {
	createSmplxProgramCompiler,
	createSmplxProgramParamTypes,
	createSmplxScriptPubKeyCompiler,
} from "./compileProgramWithSmplx";
import { smplx } from "./smplxWasmForTests";

const NETWORK = "liquidtestnet";
const POLICY_ASSET = "144c654344aa716d6f3abcc1ca90e5641e4e2a7f633bc09fe3baf64585819a49";
const MNEMONIC =
	"abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const SIGNER = new smplx.Signer(MNEMONIC, NETWORK);
const KEY = SIGNER.schnorrPublicKey().slice(-64);
const WALLET_SCRIPT = SIGNER.scriptPubKeyHex();
const DESCRIPTOR = new lwk.Signer(new lwk.Mnemonic(MNEMONIC), lwk.Network.testnet())
	.wpkhSlip77Descriptor()
	.toString();
const PLENTY = "100000000";
const CHAIN_TIP = 3_000_000;
const FIXTURES = new URL(
	"../../../../../../../../packages/tx-manifest/src/__fixtures__/",
	import.meta.url,
);

type Holding = { amount: string; asset: string };
type Spend = Holding & { transactionHex?: string; txOutHex?: string; utxoType: string };

type Request = {
	holdings?: Record<string, string>;
	owned?: Record<string, SelectableUtxo[]>;
	instance?: Record<string, string>;
	params?: Record<string, unknown>;
	spends?: Spend[];
};

class ReferenceExample {
	readonly manifest: Record<string, unknown>;
	readonly params: Record<string, string>;
	private readonly contractSources: Record<string, string>;

	constructor(
		readonly name: string,
		private readonly template?: string,
		private readonly estimateFee: EstimateFee = simplexFee,
	) {
		const at = new URL(`${name}/`, FIXTURES);
		const read = (path: string) => readFileSync(new URL(path, at), "utf8");

		this.manifest = JSON.parse(read("txmanifest.json"));
		this.contractSources = Object.fromEntries(
			readdirSync(at)
				.filter((file) => file.endsWith(".simf"))
				.map((file) => [`./${file}`, read(file)]),
		);
		this.params = readdirSync(at).includes("data") ? JSON.parse(read("data/params.json")) : {};
	}

	source(path: string): string {
		return this.contractSources[path] ?? "";
	}

	async review(action: string, request: Request = {}) {
		const spends = request.spends ?? [];
		const held = new Map(spends.map((spend, at) => [outpoint(at), spend]));
		let lastScript = "";
		const compile = createSmplxProgramCompiler(smplx);

		return reviewManifestAction(
			{
				action,
				broadcast: false,
				contractSources: this.contractSources,
				manifest: this.manifest,
				params: { ...this.params, ...request.params },
				...(request.instance === undefined
					? {}
					: {
							instance: {
								instance: { fields: request.instance, template: this.template ?? "" },
							},
						}),
				...(spends.length === 0
					? {}
					: {
							state: {
								utxos: spends.map((spend, at) => ({
									asset: spend.asset,
									txid: outpoint(at),
									utxo_type: spend.utxoType,
									vout: 0,
								})),
							},
						}),
			} as ParsedLiquidProcessCtParams,
			{
				accountLabel: "liquid:testnet account 0",
				compile: async (input) => {
					const compiled = await compile(input);

					lastScript = compiled.scriptPubKeyHex;

					return compiled;
				},
				compilerVersion: SMPLX_COMPILER_VERSION,
				estimateFee: this.estimateFee,
				programParamTypes: createSmplxProgramParamTypes(smplx),
				fundingUtxos: request.owned?.[POLICY_ASSET] ?? [wallet(POLICY_ASSET, PLENTY)],
				holdingsOf: (asset) =>
					request.owned?.[asset] ?? [wallet(asset, request.holdings?.[asset] ?? PLENTY)],
				network: NETWORK,
				policyAsset: POLICY_ASSET,
				readAddress: addressReader(lwk, lwk.Network.testnet()),
				readChainTip: async () => CHAIN_TIP,
				unblind: walletUnblinder(lwk, DESCRIPTOR, WALLET_SCRIPT),
				walletAddress: SIGNER.address(),
				walletKey: KEY,
				readFeeRate: async () => 100,
				readTxOut: async ({ txid }) => {
					const blinded = held.get(txid)?.txOutHex;

					if (blinded !== undefined) {
						const transactionHex = held.get(txid)?.transactionHex;

						return {
							scriptPubKeyHex: lastScript,
							...(transactionHex === undefined ? {} : { transactionHex }),
							txOutHex: blinded,
						};
					}

					const amountSats = held.get(txid)?.amount ?? PLENTY;
					const rawAssetId = held.get(txid)?.asset ?? POLICY_ASSET;

					return {
						amountSats,
						rawAssetId,
						scriptPubKeyHex: lastScript,
						txOutHex: explicitTxOut(lastScript, rawAssetId, amountSats),
					};
				},
				scriptPubKeyOf: createSmplxScriptPubKeyCompiler(smplx, NETWORK),
				walletScriptPubKeyHex: WALLET_SCRIPT,
			},
		);
	}

	async reviewed(action: string, request: Request = {}): Promise<ManifestReview> {
		const result = await this.review(action, request);

		if (isRefusal(result)) {
			throw new Error(`${this.name} ${action} refused (${result.reject}): ${result.reason}`);
		}

		return result;
	}

	async outcome(action: string, request: Request = {}): Promise<string> {
		const result = await this.review(action, request);

		return isRefusal(result) ? result.reject : "reviewed";
	}
}

function outpoint(at: number): string {
	return (at + 1).toString(16).repeat(64);
}

function wallet(asset: string, amount: string, txid = asset) {
	return {
		amount,
		spendable: true,
		txOut: explicitTxOut(WALLET_SCRIPT, asset, amount),
		txid,
		vout: 1,
	};
}

function explicitTxOut(script: string, asset: string, sats: string): string {
	const internal = (asset.match(/../g) ?? []).toReversed().join("");
	const length = (script.length / 2).toString(16).padStart(2, "0");

	return `01${internal}01${BigInt(sats).toString(16).padStart(16, "0")}00${length}${script}`;
}

function simplexFee(draft: TransactionDraft, feeRateSatsPerKvb: number): bigint {
	return built(draft, (builder) =>
		smplx.Signer.estimateStrictFee(builder, NETWORK, feeRateSatsPerKvb),
	);
}

function built<Finished>(
	draft: TransactionDraft,
	finish: (builder: InstanceType<typeof smplx.TransactionBuilder>) => Finished,
): Finished {
	return assembleReviewedTransaction(
		draft,
		{ blindingPublicKeyHex: SIGNER.blindingPublicKey(), signingDerivationPath: "0/0", smplx },
		finish,
	);
}

function signed(review: ManifestReview): { feeSats: bigint; hex: string } {
	const transaction = built(review, (builder) =>
		SIGNER.finalizeStrictFee(builder, review.feeRateSatsPerKvb),
	);

	try {
		return { feeSats: transaction.feeSats, hex: transaction.hex };
	} finally {
		transaction.free();
	}
}

function signedFee(review: ManifestReview): bigint {
	return signed(review).feeSats;
}

function receivedIn(hex: string, asset: string): SelectableUtxo {
	const network = lwk.Network.testnet();
	const descriptor = new lwk.Signer(new lwk.Mnemonic(MNEMONIC), network)
		.wpkhSlip77Descriptor()
		.toString();
	const master = /slip77\((?<key>[0-9a-f]{64})\)/.exec(descriptor)?.groups?.key ?? "";
	const blindingKey = lwk.SecretKey.fromBytes(
		hmac(sha256, hexToBytes(master), hexToBytes(WALLET_SCRIPT)),
	);
	const transaction = lwk.Transaction.fromString(hex);

	for (let vout = 0; ; vout += 1) {
		const output = transaction.output(vout);

		if (!output) {
			throw new Error(`The wallet received no blinded output of ${asset}.`);
		}

		if (!output.isPartiallyBlinded()) {
			continue;
		}

		const secrets = output.unblind(blindingKey);

		if (secrets.asset().toString() !== asset) {
			continue;
		}

		return {
			amount: secrets.value().toString(),
			blindingSecretsJson: JSON.stringify({
				asset,
				assetBlindingFactor: secrets.assetBlindingFactor().toString(),
				value: Number(secrets.value()),
				valueBlindingFactor: secrets.valueBlindingFactor().toString(),
			}),
			confidential: true,
			derivationPath: "0/0",
			spendable: true,
			txOut: output.toString(),
			txid: transaction.txid().toString(),
			vout,
		};
	}
}

describe("p2pk", () => {
	const p2pk = new ReferenceExample("p2pk");

	test("Pay locks funds in a program the compiler builds", async () => {
		const { programs } = await p2pk.reviewed("Pay", { params: { amount_sat: 1000, pubkey: KEY } });

		expect(programs.map(({ role, verified }) => ({ role, verified }))).toEqual([
			{ role: "created", verified: "not-yet-onchain" },
		]);
	});

	test("Receive spends that program once the chain holds the funds", async () => {
		const { programs } = await p2pk.reviewed("Receive", {
			params: { pubkey: KEY },
			spends: [{ amount: "50000", asset: POLICY_ASSET, utxoType: "p2pk_output" }],
		});

		expect(programs.map((found) => found.verified)).toEqual(["matches-chain"]);
	});

	test("Pay and Receive sign, paying exactly the fee the review shows", async () => {
		const pay = await p2pk.reviewed("Pay", { params: { amount_sat: 1000, pubkey: KEY } });
		const receive = await p2pk.reviewed("Receive", {
			params: { pubkey: KEY },
			spends: [{ amount: "50000", asset: POLICY_ASSET, utxoType: "p2pk_output" }],
		});

		expect(signedFee(pay)).toBe(pay.estimatedFeeSats);
		expect(signedFee(receive)).toBe(receive.estimatedFeeSats);
	});

	test("Pay blinds the program output with chosen factors, and Receive opens it by stating them", async () => {
		const blinding = { asset_bf: "3", value_bf: "5" };
		const paying = new ReferenceExample("p2pk");
		const actions = paying.manifest.actions as Record<
			string,
			{ inputs: Record<string, unknown>[]; outputs: Record<string, unknown>[] }
		>;

		Object.assign(actions.Pay!.outputs[0]!, { blinding, confidential: true });
		actions.Pay!.outputs.splice(1, 0, {
			amount_sat: 1000,
			asset: "lbtc",
			destination: "wallet",
			id: "kept_out",
		});
		Object.assign(actions.Receive!.inputs[0]!, { amount_sat: 1000, blinding });

		const pay = await paying.reviewed("Pay", { params: { amount_sat: 1000, pubkey: KEY } });
		const paid = signed(pay);
		const locked = lwk.Transaction.fromString(paid.hex).output(0)?.toString() ?? "";
		const receive = await paying.reviewed("Receive", {
			params: { pubkey: KEY },
			spends: [{ amount: "1000", asset: POLICY_ASSET, txOutHex: locked, utxoType: "p2pk_output" }],
		});

		expect(paid.feeSats).toBe(pay.estimatedFeeSats);
		expect(signedFee(receive)).toBe(receive.estimatedFeeSats);
	});

	test("Pay blinds the program output with the wallet's key, and Receive reopens it with that key", async () => {
		const paying = new ReferenceExample("p2pk");
		const actions = paying.manifest.actions as Record<
			string,
			{ outputs: Record<string, unknown>[] }
		>;

		Object.assign(actions.Pay!.outputs[0]!, { confidential: true });

		const pay = await paying.reviewed("Pay", { params: { amount_sat: 1000, pubkey: KEY } });
		const paid = signed(pay);
		const transaction = lwk.Transaction.fromString(paid.hex);
		const receive = await paying.reviewed("Receive", {
			params: { pubkey: KEY },
			spends: [
				{
					amount: "1000",
					asset: POLICY_ASSET,
					transactionHex: paid.hex,
					txOutHex: transaction.output(0)?.toString() ?? "",
					utxoType: "p2pk_output",
				},
			],
		});

		expect(paid.feeSats).toBe(pay.estimatedFeeSats);
		expect(receive.outputs.find((output) => output.id === "received_out")?.sats).toBe(1000n);
		expect(signedFee(receive)).toBe(receive.estimatedFeeSats);
	});

	test("Pay also pays another wallet's confidential address, blinded to that wallet, at the fee shown", async () => {
		const theirs = new smplx.Signer(
			"legal winner thank year wave sausage worth useful legal winner thank yellow",
			NETWORK,
		);
		const paying = new ReferenceExample("p2pk");
		const pay = (paying.manifest.actions as Record<string, { outputs: unknown[] }>).Pay;

		pay?.outputs.unshift({
			amount_sat: 500,
			destination: "params.receiver",
			id: "theirs_out",
		});

		const review = await paying.reviewed("Pay", {
			params: { amount_sat: 1000, pubkey: KEY, receiver: theirs.confidentialAddress() },
		});

		expect(review.outputs[0]).toMatchObject({
			blinded: true,
			blindingPublicKeyHex: theirs.blindingPublicKey(),
			scriptPubKeyHex: theirs.scriptPubKeyHex(),
		});
		expect(signedFee(review)).toBe(review.estimatedFeeSats);
	});
});

describe("last_will", () => {
	const lastWill = new ReferenceExample("last_will", "last_will_contract");
	const keys = { COLD_PUB_KEY: KEY, HOT_PUB_KEY: KEY, INHERITOR_PUB_KEY: KEY };

	async function will() {
		const { createdInstance } = await lastWill.reviewed("Fund", {
			params: { ...keys, amount_sat: 1000 },
		});

		return createdInstance?.fields ?? {};
	}

	test("Fund creates the will, filling the inheritance delay from its default", async () => {
		expect(await will()).toEqual({ ...keys, INHERIT_BLOCKS: "25920" });
	});

	const spends = [{ amount: "50000", asset: POLICY_ASSET, utxoType: "last_will" }];

	test("ColdBreak and Refresh move the will's funds less exactly the fee the review prices", async () => {
		const instance = await will();

		for (const action of ["ColdBreak", "Refresh"]) {
			// oxlint-disable-next-line no-await-in-loop
			const { estimatedFeeSats, outputs } = await lastWill.reviewed(action, { instance, spends });

			expect(estimatedFeeSats).toBeGreaterThan(0n);
			expect(outputs.map((output) => output.sats)).toEqual([50_000n - estimatedFeeSats]);
		}
	});

	test("ColdBreak and Refresh sign, leaving the unused signature aside, at exactly the fee shown", async () => {
		const instance = await will();

		for (const action of ["ColdBreak", "Refresh"]) {
			// oxlint-disable-next-line no-await-in-loop
			const review = await lastWill.reviewed(action, { instance, spends });

			expect(signedFee(review)).toBe(review.estimatedFeeSats);
		}
	});

	test("Inherit signs, with the inheritance delay on the will and not on the fee input", async () => {
		const review = await lastWill.reviewed("Inherit", { instance: await will(), spends });

		expect(review.inputOrder.map((planned) => [planned.source, planned.sequence])).toEqual([
			["program", 25_920],
			["wallet", undefined],
		]);
		expect(signedFee(review)).toBe(review.estimatedFeeSats);
	});
});

describe("dex", () => {
	const dex = new ReferenceExample("dex", "tessera_offer_contract");

	async function offer() {
		const { createdInstance } = await dex.reviewed("MakeOffer", { params: { MAKER_PUB_KEY: KEY } });

		return createdInstance?.fields ?? {};
	}

	test("MakeOffer creates an offer committing to the maker's own script", async () => {
		expect(await offer()).toMatchObject({
			MAKER_PUB_KEY: KEY,
			MAKER_SPK: expect.stringMatching(/^[0-9a-f]{64}$/),
		});
	});

	test("Settle, Refund and ClaimPayout spend what the offer locked", async () => {
		const instance = await offer();
		const locked = {
			amount: dex.params.OFFER_AMOUNT ?? "",
			asset: dex.params.OFFER_ASSET_ID ?? "",
		};
		const outcomes = {
			ClaimPayout: await dex.outcome("ClaimPayout", {
				instance,
				spends: [{ amount: "2000", asset: POLICY_ASSET, utxoType: "maker_payout" }],
			}),
			Refund: await dex.outcome("Refund", {
				instance,
				spends: [{ ...locked, utxoType: "tessera_offer" }],
			}),
			Settle: await dex.outcome("Settle", {
				instance,
				spends: [{ ...locked, utxoType: "tessera_offer" }],
			}),
		};

		expect(outcomes).toEqual({ ClaimPayout: "reviewed", Refund: "reviewed", Settle: "reviewed" });
	});
});

describe("lending_v3", () => {
	const lending = new ReferenceExample("lending_v3", "lending_contract", () => 500n);
	const zero = "00".repeat(32);
	const borrowerNft = "ab".repeat(32);
	const lenderNft = "cd".repeat(32);
	const terms = lending.params;
	const offer = {
		...terms,
		BORROWER_NFT_ASSET_ID: borrowerNft,
		CURRENT_DEBT: "1010",
		FINALIZED_LENDER_VAULT_COV_HASH: zero,
		FINALIZED_PROTOCOL_FEE_VAULT_COV_HASH: zero,
		ISSUING_UTXOS_COUNT: "2",
		LENDER_NFT_ASSET_ID: lenderNft,
		LENDER_VAULT_COV_HASH: zero,
		LENDING_COV_SCRIPT_HASH: zero,
		PRINCIPAL_OUTPUT_SCRIPT_HASH: zero,
		PROTOCOL_FEE_VAULT_COV_HASH: zero,
		REISSUANCE_FLAGS: "0",
	} as Record<string, string>;
	const collateral = {
		amount: offer.COLLATERAL_AMOUNT ?? "",
		asset: offer.COLLATERAL_ASSET_ID ?? "",
	};
	const principal = { amount: offer.PRINCIPAL_AMOUNT ?? "", asset: offer.PRINCIPAL_ASSET_ID ?? "" };
	const nfts = { [borrowerNft]: "1", [lenderNft]: "1" };

	test("the issuance factory compiles to the script the deployed indexer tracks", () => {
		const factory = new smplx.Program(
			lending.source("./issuance_factory.simf"),
			JSON.stringify({
				ISSUING_UTXOS_COUNT: { type: "u8", value: "2" },
				REISSUANCE_FLAGS: { type: "u64", value: "0" },
			}),
			undefined,
			true,
		);

		try {
			expect(factory.scriptPubkey(NETWORK)).toBe(
				"5120456881785cc7d561caaa059e02f1a2823066bd860423996bea3e92c621bb064b",
			);
		} finally {
			factory.free();
		}
	});

	test("each action reviews against an offer", async () => {
		const outcomes = {
			AcceptOffer: await lending.outcome("AcceptOffer", {
				holdings: nfts,
				instance: offer,
				spends: [
					{ ...collateral, utxoType: "lending_collateral" },
					{ amount: "1", asset: lenderNft, utxoType: "lender_nft_script_auth" },
				],
			}),
			CancelOffer: await lending.outcome("CancelOffer", {
				holdings: nfts,
				instance: offer,
				spends: [
					{ ...collateral, utxoType: "lending_collateral" },
					{ amount: "1", asset: lenderNft, utxoType: "lender_nft_script_auth" },
				],
			}),
			ClaimPrincipal: await lending.outcome("ClaimPrincipal", {
				holdings: nfts,
				instance: offer,
				spends: [{ ...principal, utxoType: "principal_asset_auth" }],
			}),
			CreateFactory: await lending.outcome("CreateFactory"),
			CreateOffer: await lending.outcome("CreateOffer", {
				holdings: { [terms.FACTORY_ASSET_ID ?? ""]: "1" },
				instance: { FACTORY_ASSET_ID: terms.FACTORY_ASSET_ID ?? "" },
				spends: [
					{ amount: "1", asset: terms.FACTORY_ASSET_ID ?? "", utxoType: "issuance_factory" },
				],
			}),
			RepayLoan: await lending.outcome("RepayLoan", {
				holdings: nfts,
				instance: offer,
				spends: [{ ...collateral, utxoType: "lending_collateral_active" }],
			}),
		};

		expect(outcomes).toEqual({
			AcceptOffer: "reviewed",
			CancelOffer: "reviewed",
			ClaimPrincipal: "reviewed",
			CreateFactory: "reviewed",
			CreateOffer: "reviewed",
			RepayLoan: "reviewed",
		});
	});
});

describe("lending_v2", () => {
	const lending = new ReferenceExample("lending_v2");

	test("IssueUtilityNFTs fills the borrower's key, address and script hash from the wallet, and signs", async () => {
		const review = await new ReferenceExample("lending_v2", "lending_contract").reviewed(
			"IssueUtilityNFTs",
			{
				owned: {
					[POLICY_ASSET]: [1, 2, 3, 4, 5].map((at) =>
						wallet(POLICY_ASSET, PLENTY, at.toString(16).repeat(64)),
					),
				},
			},
		);

		expect(review.createdInstance?.fields).toMatchObject({
			BORROWER_ADDRESS: SIGNER.address(),
			BORROWER_PUB_KEY: KEY,
		});
		expect(signedFee(review)).toBe(review.estimatedFeeSats);
	});

	test("Prepare and PrepareLender sign, paying exactly the fee the review shows", async () => {
		for (const action of ["Prepare", "PrepareLender"]) {
			// oxlint-disable-next-line no-await-in-loop
			const review = await lending.reviewed(action);

			expect(signedFee(review)).toBe(review.estimatedFeeSats);
		}
	});
});

describe("multiasset", () => {
	const multiasset = new ReferenceExample("multiasset");

	test("locks the token in a program with chosen factors, then reissues from the program", async () => {
		const minted = await multiasset.reviewed("MintReissuable", { params: { supply: 21 } });
		const mint = signed(minted);
		const [issued] = minted.issuances;

		if (!issued) {
			throw new Error("The mint planned no issuance.");
		}

		const token = issued.reissuanceToken;
		const locked = await multiasset.reviewed("LockToken", {
			owned: { [token]: [receivedIn(mint.hex, token)] },
			params: { pubkey: KEY, token },
		});
		const lock = signed(locked);
		const reissued = await multiasset.reviewed("ReissueFromProgram", {
			params: { entropy: issued.entropy, issued: issued.asset, pubkey: KEY, supply: 50, token },
			spends: [
				{
					amount: "1",
					asset: token,
					transactionHex: lock.hex,
					txOutHex: lwk.Transaction.fromString(lock.hex).output(0)?.toString() ?? "",
					utxoType: "p2pk_output",
				},
			],
		});

		expect(lock.feeSats).toBe(locked.estimatedFeeSats);
		expect(reissued.issuances[0]).toMatchObject({ asset: issued.asset, kind: "reissue" });
		expect(signedFee(reissued)).toBe(reissued.estimatedFeeSats);
	});

	test("mints an asset with its reissuance token, then reissues from that token, each at exactly the fee shown", async () => {
		const minted = await multiasset.reviewed("MintReissuable", { params: { supply: 21 } });
		const mint = signed(minted);
		const [issued] = minted.issuances;

		if (!issued) {
			throw new Error("The mint planned no issuance.");
		}

		const reissued = await multiasset.reviewed("Reissue", {
			owned: { [issued.reissuanceToken]: [receivedIn(mint.hex, issued.reissuanceToken)] },
			params: {
				entropy: issued.entropy,
				issued: issued.asset,
				supply: 50,
				token: issued.reissuanceToken,
			},
		});

		expect(mint.feeSats).toBe(minted.estimatedFeeSats);
		expect(reissued.issuances[0]).toMatchObject({ asset: issued.asset, kind: "reissue" });
		expect(signedFee(reissued)).toBe(reissued.estimatedFeeSats);
	});
});

describe("deadcat_v3", () => {
	const market = new ReferenceExample("deadcat_v3", "binary_market");

	async function issueTokens() {
		const issued = await market.reviewed("IssueReissuanceTokens", {
			owned: {
				[POLICY_ASSET]: [
					wallet(POLICY_ASSET, PLENTY, "a1".repeat(32)),
					wallet(POLICY_ASSET, PLENTY, "b2".repeat(32)),
				],
			},
			params: { COLLATERAL_ASSET_ID: POLICY_ASSET, EXPIRY_TIME: 3_100_000, ORACLE_PUBLIC_KEY: KEY },
		});

		return { issued, transaction: signed(issued) };
	}

	test("IssueReissuanceTokens mints both tokens blinded to the wallet, at the fee shown", async () => {
		const { issued, transaction } = await issueTokens();

		expect(issued.outputs.filter((output) => output.blinded).map((output) => output.id)).toEqual([
			"yes_reissuance_out",
			"no_reissuance_out",
		]);
		expect(transaction.feeSats).toBe(issued.estimatedFeeSats);
	});

	test("CreateMarket waits on Simplex building the market's 8-byte state leaf", async () => {
		const { issued, transaction } = await issueTokens();
		const instance = issued.createdInstance?.fields ?? {};
		const yes = instance.YES_REISSUANCE_TOKEN ?? "";
		const no = instance.NO_REISSUANCE_TOKEN ?? "";

		expect(
			await market.outcome("CreateMarket", {
				instance,
				owned: {
					[no]: [receivedIn(transaction.hex, no)],
					[yes]: [receivedIn(transaction.hex, yes)],
				},
			}),
		).toBe("document-fault");
	});
});
