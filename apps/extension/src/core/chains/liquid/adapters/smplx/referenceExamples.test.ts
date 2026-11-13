import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";

import { SMPLX_COMPILER_VERSION } from "@humid/smplx-compiler";
import {
	isRefusal,
	type ManifestReview,
	type ParsedLiquidProcessCtParams,
	reviewManifestAction,
	type SelectableUtxo,
	type TransactionDraft,
} from "@humid/tx-manifest";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

import { lwk } from "../lwk/lwkWasmForTests";
import { addressReader } from "../lwk/wallet/readAddress";
import { walletUnblinder } from "../lwk/wallet/walletUnblinder";
import { assembleReviewedTransaction } from "./assembleReviewedTransaction";
import {
	createSmplxProgramCompiler,
	createSmplxProgramAbi,
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
const WALLET_BLINDING_KEY = hmac(
	sha256,
	hexToBytes(/slip77\((?<key>[0-9a-f]{64})\)/.exec(DESCRIPTOR)?.groups?.key ?? ""),
	hexToBytes(WALLET_SCRIPT),
);
const PLENTY = "100000000";
const CHAIN_TIP = 3_000_000;
const CHAIN = new Map<string, string>();
const FIXTURES = new URL(
	"../../../../../../../../packages/tx-manifest/src/__fixtures__/",
	import.meta.url,
);

type Spend = {
	amount?: string;
	asset: string;
	at?: { txid: string; vout: number };
	utxoType: string;
};

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
								utxos: spends.map((spend, at) => {
									const { txid, vout } = spend.at ?? { txid: outpoint(at), vout: 0 };

									return { asset: spend.asset, txid, utxo_type: spend.utxoType, vout };
								}),
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
				estimateFee: simplexFee,
				programAbi: createSmplxProgramAbi(smplx),
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
				readTxOut: async ({ txid, vout }) => {
					const recorded = CHAIN.get(txid);

					if (recorded !== undefined) {
						return chainTxOut(recorded, vout);
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
		scriptPubKeyHex: WALLET_SCRIPT,
		spendable: true,
		txOut: explicitTxOut(WALLET_SCRIPT, asset, amount),
		txid,
		vout: 1,
	};
}

function chainTxOut(transactionHex: string, vout: number) {
	const output = lwk.Transaction.fromString(transactionHex).output(vout);
	const sats = output?.value();
	const asset = output?.asset()?.toString();

	return {
		...(sats === undefined || asset === undefined
			? {}
			: { amountSats: sats.toString(), rawAssetId: asset }),
		scriptPubKeyHex: bytesToHex(output?.scriptPubkey().bytes() ?? new Uint8Array()),
		transactionHex,
		txOutHex: output?.toString() ?? "",
	};
}

function explicitTxOut(script: string, asset: string, sats: string): string {
	const internal = (asset.match(/../g) ?? []).toReversed().join("");
	const length = (script.length / 2).toString(16).padStart(2, "0");

	return `01${internal}01${BigInt(sats).toString(16).padStart(16, "0")}00${length}${script}`;
}

function received(hex: string, ...assets: string[]): Record<string, SelectableUtxo[]> {
	return Object.fromEntries(assets.map((asset) => [asset, coinsOf(hex, asset)]));
}

function heldAt(
	transaction: { txid: string },
	vout: number,
	utxoType: string,
	asset: string,
): Spend {
	return { asset, at: { txid: transaction.txid, vout }, utxoType };
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

function signed(review: ManifestReview): { feeSats: bigint; hex: string; txid: string } {
	const transaction = built(review, (builder) =>
		SIGNER.finalizeStrictFee(builder, review.feeRateSatsPerKvb),
	);

	try {
		const txid = lwk.Transaction.fromString(transaction.hex).txid().toString();

		CHAIN.set(txid, transaction.hex);

		return { feeSats: transaction.feeSats, hex: transaction.hex, txid };
	} finally {
		transaction.free();
	}
}

function signedFee(review: ManifestReview): bigint {
	return signed(review).feeSats;
}

function settled(review: ManifestReview): { hex: string; txid: string } {
	const transaction = signed(review);

	expect(transaction.feeSats).toBe(review.estimatedFeeSats);

	return transaction;
}

function coinsOf(hex: string, asset: string): SelectableUtxo[] {
	const transaction = lwk.Transaction.fromString(hex);
	const txid = transaction.txid().toString();
	const coins: SelectableUtxo[] = [];

	for (let vout = 0, output = transaction.output(0); output; output = transaction.output(++vout)) {
		if (bytesToHex(output.scriptPubkey().bytes()) !== WALLET_SCRIPT) {
			continue;
		}

		const coin = {
			scriptPubKeyHex: WALLET_SCRIPT,
			spendable: true,
			txOut: output.toString(),
			txid,
			vout,
		};

		if (!output.isPartiallyBlinded()) {
			if (output.asset()?.toString() === asset) {
				coins.push({ ...coin, amount: String(output.value()) });
			}

			continue;
		}

		const secrets = output.unblind(lwk.SecretKey.fromBytes(WALLET_BLINDING_KEY));

		if (secrets.asset().toString() === asset) {
			coins.push({
				...coin,
				amount: secrets.value().toString(),
				blindingSecretsJson: JSON.stringify({
					asset,
					assetBlindingFactor: secrets.assetBlindingFactor().toString(),
					value: Number(secrets.value()),
					valueBlindingFactor: secrets.valueBlindingFactor().toString(),
				}),
				confidential: true,
				derivationPath: "0/0",
			});
		}
	}

	return coins;
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
		const receive = await paying.reviewed("Receive", {
			params: { pubkey: KEY },
			spends: [heldAt(paid, 0, "p2pk_output", POLICY_ASSET)],
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
		const receive = await paying.reviewed("Receive", {
			params: { pubkey: KEY },
			spends: [heldAt(paid, 0, "p2pk_output", POLICY_ASSET)],
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
	const offered = { asset: dex.params.OFFER_ASSET_ID ?? "" };

	async function makeOffer() {
		const review = await dex.reviewed("MakeOffer", { params: { MAKER_PUB_KEY: KEY } });

		return { instance: review.createdInstance?.fields ?? {}, offer: settled(review) };
	}

	test("MakeOffer creates an offer committing to the maker's own script", async () => {
		expect((await makeOffer()).instance).toMatchObject({
			MAKER_PUB_KEY: KEY,
			MAKER_SPK: expect.stringMatching(/^[0-9a-f]{64}$/),
		});
	});

	test("Settle, Refund and ClaimPayout spend what the offer locked, each at exactly the fee shown", async () => {
		const { instance, offer } = await makeOffer();
		const locked = [heldAt(offer, 0, "tessera_offer", offered.asset)];
		const settle = settled(await dex.reviewed("Settle", { instance, spends: locked }));

		settled(await dex.reviewed("Refund", { instance, spends: locked }));
		settled(
			await dex.reviewed("ClaimPayout", {
				instance,
				spends: [heldAt(settle, 0, "maker_payout", POLICY_ASSET)],
			}),
		);
	});
});

describe("lending_v3", () => {
	const issuanceFactory = new ReferenceExample("lending_v3", "issuance_factory");
	const lending = new ReferenceExample("lending_v3", "lending_contract");

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

	test("a loan from a new factory signs every step at exactly the fee shown", async () => {
		const made = await issuanceFactory.reviewed("CreateFactory");
		const factoryAsset = made.createdInstance?.fields.FACTORY_ASSET_ID ?? "";
		const factoryMade = settled(made);
		const offered = await lending.reviewed("CreateOffer", {
			instance: { FACTORY_ASSET_ID: factoryAsset },
			owned: received(factoryMade.hex, factoryAsset),
			params: { FACTORY_ASSET_ID: factoryAsset },
			spends: [heldAt(factoryMade, 1, "issuance_factory", factoryAsset)],
		});
		const offer = settled(offered);
		const instance = offered.createdInstance?.fields ?? {};
		const [collateral, principal, borrowerNft, lenderNft] = [
			"COLLATERAL_ASSET_ID",
			"PRINCIPAL_ASSET_ID",
			"BORROWER_NFT_ASSET_ID",
			"LENDER_NFT_ASSET_ID",
		].map((name) => instance[name] ?? "");
		const borrower = received(offer.hex, borrowerNft ?? "");
		const pending = [
			heldAt(offer, 5, "lending_collateral", collateral ?? ""),
			heldAt(offer, 3, "lender_nft_script_auth", lenderNft ?? ""),
		];

		settled(await lending.reviewed("CancelOffer", { instance, owned: borrower, spends: pending }));

		const accepted = settled(await lending.reviewed("AcceptOffer", { instance, spends: pending }));

		settled(
			await lending.reviewed("ClaimPrincipal", {
				instance,
				owned: borrower,
				spends: [heldAt(accepted, 1, "principal_asset_auth", principal ?? "")],
			}),
		);
		settled(
			await lending.reviewed("RepayLoan", {
				instance,
				owned: borrower,
				spends: [heldAt(accepted, 0, "lending_collateral_active", collateral ?? "")],
			}),
		);
	});
});

describe("lending_v2", () => {
	const lending = new ReferenceExample("lending_v2");
	const loan = new ReferenceExample("lending_v2", "lending_contract");

	test("a loan signs every step at exactly the fee shown", async () => {
		const issue = await loan.reviewed("IssueUtilityNFTs", {
			owned: {
				[POLICY_ASSET]: [1, 2, 3, 4, 5].map((at) =>
					wallet(POLICY_ASSET, PLENTY, at.toString(16).repeat(64)),
				),
			},
			params: { LOAN_EXPIRATION_TIME: CHAIN_TIP - 1 },
		});
		const instance = issue.createdInstance?.fields ?? {};
		const issued = settled(issue);
		const assets = [
			"COLLATERAL_ASSET_ID",
			"FIRST_PARAMETERS_NFT_ASSET_ID",
			"SECOND_PARAMETERS_NFT_ASSET_ID",
			"BORROWER_NFT_ASSET_ID",
			"LENDER_NFT_ASSET_ID",
		].map((name) => instance[name] ?? "");
		const [collateral = "", firstParams = "", secondParams = "", borrowerNft = "", lenderNft = ""] =
			assets;

		expect(instance).toMatchObject({ BORROWER_ADDRESS: SIGNER.address(), BORROWER_PUB_KEY: KEY });

		const locked = settled(
			await loan.reviewed("LockCollateral", { instance, owned: received(issued.hex, ...assets) }),
		);
		const offer = [
			heldAt(locked, 0, "pre_lock", collateral),
			...assets.slice(1).map((asset, at) => heldAt(locked, at + 1, "prelock_script_auth", asset)),
		];

		settled(await loan.reviewed("CancelOffer", { instance, spends: offer }));

		const lent = settled(await loan.reviewed("SetupLending", { instance, spends: offer }));
		const active = [
			heldAt(lent, 0, "lending_collateral", collateral),
			heldAt(lent, 2, "lending_script_auth", firstParams),
			heldAt(lent, 3, "lending_script_auth", secondParams),
		];
		const lender = received(lent.hex, lenderNft);

		settled(
			await loan.reviewed("LiquidateAfterExpiry", { instance, owned: lender, spends: active }),
		);

		const repaid = settled(
			await loan.reviewed("RepayLoan", {
				instance,
				owned: received(lent.hex, borrowerNft),
				spends: active,
			}),
		);

		settled(
			await loan.reviewed("ClaimPrincipalWithInterest", {
				instance,
				owned: lender,
				spends: [heldAt(repaid, 1, "lender_principal_vault", instance.PRINCIPAL_ASSET_ID ?? "")],
			}),
		);
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
			owned: received(mint.hex, token),
			params: { pubkey: KEY, token },
		});
		const lock = signed(locked);
		const reissued = await multiasset.reviewed("ReissueFromProgram", {
			params: { entropy: issued.entropy, issued: issued.asset, pubkey: KEY, supply: 50, token },
			spends: [heldAt(lock, 0, "p2pk_output", token)],
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
			owned: received(mint.hex, issued.reissuanceToken),
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
				owned: received(transaction.hex, no, yes),
			}),
		).toBe("document-fault");
	});
});
