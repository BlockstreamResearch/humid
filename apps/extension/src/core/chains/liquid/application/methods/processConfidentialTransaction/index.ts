import { SMPLX_COMPILER_VERSION } from "@humid/smplx-compiler";
import {
	createEsploraFeeRateReader,
	createEsploraTxOutReader,
	isRefusal,
	type ManifestReview,
	type ActionRequest,
	parseActionRequest,
	type ReadAddress,
	type ReadFeeRate,
	Refusal,
	type ReadTxOut,
	reviewManifestAction,
	type Unblind,
	type SelectableUtxo,
	toShownConfirmation,
} from "@humid/tx-manifest";

import { createWalletMethod } from "@/core/wallet-methods/createWalletMethod";
import { WALLET_RPC_ERROR_REASONS, WalletRpcInvalidParamsError } from "@/core/wallet-rpc/errors";

import { createLwkNetwork } from "../../../adapters/lwk/createLwkNetwork";
import { loadLwkWasm } from "../../../adapters/lwk/loadLwkWasm";
import { addressReader } from "../../../adapters/lwk/wallet/readAddress";
import { walletKeyOf } from "../../../adapters/lwk/wallet/walletKey";
import { walletUnblinder } from "../../../adapters/lwk/wallet/walletUnblinder";
import { withAccountMnemonic } from "../../../adapters/lwk/wallet/withAccountMnemonic";
import { assembleReviewedTransaction } from "../../../adapters/smplx/assembleReviewedTransaction";
import {
	createSmplxProgramAbi,
	createSmplxProgramCompiler,
	createSmplxScriptHasher,
} from "../../../adapters/smplx/compileProgramWithSmplx";
import { loadSmplxWasm } from "../../../adapters/smplx/loadSmplxWasm";
import type { LiquidChainRecord } from "../../../chains/LiquidChainRecord";
import { LIQUID_WALLET_RPC_METHODS } from "../../../domain/LiquidRpc";
import type { LiquidFundingUtxo, LiquidWalletAccount } from "../../backends/LiquidWalletBackend";
import { accountNameOf, readKnownAssets, transactionReceipt } from "../../confirmationFacts";
import { resolveDappAccount } from "../../dappAccountScope";
import { chosenTargetBlocks, readSpeedRates } from "../../feeSpeeds";
import type { LiquidRpcMethodContext } from "../../LiquidRpcContext";
import { heldCoins, type SignedHold, type TransactionNote } from "../../signedHold";
import {
	PROCESS_CT_CONFIRMATION_KIND,
	type ProcessCtConfirmationData,
} from "./ProcessCtConfirmation";

export type LiquidProcessCtContext = LiquidRpcMethodContext;

type SpeedReviews = { review: ManifestReview; targetBlocks: number }[];

export type LiquidProcessCtIssuance = {
	entropy: string;
	input: string;
	issuedAsset: string;
	reissuanceToken: string;
};

export type LiquidProcessCtResult = {
	broadcast: boolean;
	deployment?: Record<string, string>;
	feeSats: string;
	issuances?: LiquidProcessCtIssuance[];
	transactionHex: string;
	txid: string;
};

const EXTERNAL_CHAIN = 0;

const SIZING_BLINDING_KEY = "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";

const SMPLX_NETWORKS: Record<string, string> = {
	mainnet: "liquid",
	regtest: "elements-regtest",
	testnet: "liquid-testnet",
};

export type LiquidProcessCtDependencies = {
	broadcastTransaction: (
		account: LiquidWalletAccount,
		txHex: string,
		note: TransactionNote,
	) => Promise<string>;
	rememberTransaction: (
		account: LiquidWalletAccount,
		txHex: string,
		signedFor: SignedHold,
	) => Promise<void>;
	loadSmplx: typeof loadSmplxWasm;
	readFeeRate: (chain: LiquidChainRecord) => ReadFeeRate;
	readTxOut: (chain: LiquidChainRecord) => ReadTxOut;
	readAddress: (chain: LiquidChainRecord) => Promise<ReadAddress>;
	resolveAccount: typeof resolveDappAccount;
	unblinder: (account: LiquidWalletAccount, scriptPubKeyHex: string) => Promise<Unblind>;
	walletKeyOf: typeof walletKeyOf;
	withMnemonic: typeof withAccountMnemonic;
};

export const liquidProcessCtDependencies: LiquidProcessCtDependencies = {
	broadcastTransaction: async (account, txHex, note) => {
		const { sentTransactions } = await import("../../../adapters/lwk/wallet/sentTransactions");

		return sentTransactions.broadcast(account, txHex, note);
	},
	loadSmplx: loadSmplxWasm,
	readFeeRate: (chain) => createEsploraFeeRateReader(chain.settings.backend),
	readTxOut: (chain) => createEsploraTxOutReader(chain.settings.backend),
	rememberTransaction: async (account, txHex, signedFor) => {
		const { sentTransactions } = await import("../../../adapters/lwk/wallet/sentTransactions");

		await sentTransactions.remember(account, txHex, signedFor);
	},
	readAddress: async (chain) => {
		const lwk = await loadLwkWasm();

		return addressReader(lwk, createLwkNetwork(lwk, chain));
	},
	resolveAccount: resolveDappAccount,
	unblinder: async (account, scriptPubKeyHex) =>
		walletUnblinder(await loadLwkWasm(), account.descriptor, scriptPubKeyHex),
	walletKeyOf,
	withMnemonic: withAccountMnemonic,
};

export const createProcessLiquidConfidentialTransaction = (
	dependencies: LiquidProcessCtDependencies = liquidProcessCtDependencies,
) =>
	createWalletMethod<ActionRequest, LiquidProcessCtContext, SpeedReviews, LiquidProcessCtResult>({
		confirmation: async ({ context, params, review }) => ({
			data: {
				assets: await readKnownAssets(context, await dependencies.resolveAccount(context)),
				broadcast: params.broadcast,
				kind: PROCESS_CT_CONFIRMATION_KIND,
				network: context.chain.name,
				speeds: review.map(({ review: atSpeed, targetBlocks }) => ({
					shown: toShownConfirmation(atSpeed.confirmation),
					targetBlocks,
				})),
			} satisfies ProcessCtConfirmationData,
			title: "Perform a contract action?",
		}),
		execute: async ({ choice, context, params, review: speeds }) => {
			const targetBlocks = chosenTargetBlocks(choice);
			const review = speeds.find((speed) => speed.targetBlocks === targetBlocks)!.review;
			const network = requireNetwork(context);
			const account = await dependencies.resolveAccount(context);
			const smplx = await dependencies.loadSmplx();

			const signed = await refusedAsRpcError(() =>
				dependencies.withMnemonic(
					{
						...(account.accountGroupIndex === undefined
							? {}
							: { accountGroupIndex: account.accountGroupIndex }),
						chain: context.chain,
						keyManagerState: context.keyManagerState,
						...(account.keySourceId === undefined ? {} : { keySourceId: account.keySourceId }),
					},
					async (mnemonic) => {
						const signer = new smplx.Signer(mnemonic, network);

						try {
							return assembleReviewedTransaction(
								review,
								{
									blindingPublicKeyHex: signer.blindingPublicKey(),
									signingDerivationPath: signingDerivationPathOf(context, account),
									smplx,
								},
								(builder) => {
									const result = signer.finalizeStrictFee(builder, review.feeRateSatsPerKvb);

									try {
										return { feeSats: result.feeSats, hex: result.hex, txid: result.txid };
									} finally {
										result.free();
									}
								},
							);
						} finally {
							signer.free();
						}
					},
				),
			);

			if (signed.feeSats !== review.estimatedFeeSats) {
				throw new WalletRpcInvalidParamsError(
					`The signed transaction pays a fee of ${signed.feeSats} sats, and the fee shown ` +
						`was ${review.estimatedFeeSats} sats.`,
					{ reject: "built-something-else" },
					WALLET_RPC_ERROR_REASONS.INVALID_MANIFEST_REQUEST,
				);
			}

			const { feeSats, hex, txid } = signed;
			const result = { feeSats: feeSats.toString(), transactionHex: hex, txid };
			const created = {
				...(review.createdInstance === undefined
					? {}
					: { deployment: review.createdInstance.fields }),
				...(review.issuances.length === 0 ? {} : { issuances: review.issuances.map(issuanceOf) }),
			};

			const note = { action: params.action, origin: context.requester?.origin ?? "" };

			if (!params.broadcast) {
				await dependencies.rememberTransaction(account, hex, {
					...note,
					holding: heldCoins(
						review.inputOrder.flatMap((input) =>
							input.source === "wallet" ? [{ amount: input.utxo.amount, asset: input.asset }] : [],
						),
					),
				});

				return { broadcast: false, ...created, ...result };
			}

			return {
				broadcast: true,
				...created,
				...result,
				txid: await dependencies.broadcastTransaction(account, hex, note),
			};
		},
		id: LIQUID_WALLET_RPC_METHODS.PROCESS_CONFIDENTIAL_TRANSACTION,
		parse: parseRequest,
		receipt: async ({ choice, context, result, review: speeds }) => {
			const targetBlocks = chosenTargetBlocks(choice);
			const shown = toShownConfirmation(
				speeds.find((speed) => speed.targetBlocks === targetBlocks)!.review.confirmation,
			);

			return transactionReceipt(context, await dependencies.resolveAccount(context), {
				changes: shown.netEffect.map((effect) => ({
					amount: effect.sats.value,
					asset: effect.asset.value,
				})),
				feeSats: shown.feeSats.value,
				txid: result.broadcast ? result.txid : undefined,
			});
		},
		review: async ({ context, params }) => {
			const network = requireNetwork(context);
			const account = await dependencies.resolveAccount(context);
			const smplx = await dependencies.loadSmplx();

			await context.walletBackend.syncAccount(account);

			const readAddress = await dependencies.readAddress(context.chain);
			const signingAddress = context.walletBackend.getSigningAddress(account);
			const walletScriptPubKeyHex = readAddress(signingAddress.address).scriptPubKeyHex;
			const reviewAt = async (feeRateSatsPerKvb: number) =>
				reviewManifestAction(params, {
					accountLabel: accountNameOf(context, account),
					chain: {
						network,
						policyAsset: account.rawPolicyAssetId,
						readAddress,
						readChainTip: async () => context.walletBackend.getTipHeight(account),
						readFeeRate: async () => feeRateSatsPerKvb,
						readTxOut: dependencies.readTxOut(context.chain),
					},
					compiler: {
						abi: createSmplxProgramAbi(smplx),
						compile: createSmplxProgramCompiler(smplx),
						scriptHashOf: createSmplxScriptHasher(smplx, network),
						version: SMPLX_COMPILER_VERSION,
					},
					estimateFee: (draft, feeRateSatsPerKvb) =>
						assembleReviewedTransaction(
							draft,
							{
								blindingPublicKeyHex: SIZING_BLINDING_KEY,
								signingDerivationPath: signingDerivationPathOf(context, account),
								smplx,
							},
							(builder) => smplx.Signer.estimateStrictFee(builder, network, feeRateSatsPerKvb),
						),
					wallet: {
						address: signingAddress.explicit,
						holdingsOf: (asset) => fundable(context, account, asset),
						key: dependencies.walletKeyOf(account.descriptor, signingAddress.index),
						scriptPubKeyHex: walletScriptPubKeyHex,
						unblind: await dependencies.unblinder(account, walletScriptPubKeyHex),
					},
				});

			const rates = await readSpeedRates(context.chain, dependencies.readFeeRate(context.chain));
			const distinct = [...new Set(rates.map(({ feeRateSatsPerKvb }) => feeRateSatsPerKvb))];
			const results = await Promise.all(distinct.map(reviewAt));
			const refused = results.find(isRefusal);

			if (refused !== undefined) {
				throw new WalletRpcInvalidParamsError(
					refused.reason,
					{ reject: refused.reject },
					WALLET_RPC_ERROR_REASONS.INVALID_MANIFEST_REQUEST,
				);
			}

			return rates.map(({ feeRateSatsPerKvb, targetBlocks }) => ({
				review: results[distinct.indexOf(feeRateSatsPerKvb)] as ManifestReview,
				targetBlocks,
			}));
		},
		spends: true,
	});

export const processLiquidConfidentialTransaction = createProcessLiquidConfidentialTransaction();

async function refusedAsRpcError<T>(run: () => Promise<T>): Promise<T> {
	try {
		return await run();
	} catch (error) {
		if (error instanceof Refusal) {
			throw new WalletRpcInvalidParamsError(
				error.reason,
				{ reject: error.reject },
				WALLET_RPC_ERROR_REASONS.INVALID_MANIFEST_REQUEST,
			);
		}

		throw error;
	}
}

function issuanceOf({
	asset,
	entropy,
	inputId,
	reissuanceToken,
}: ManifestReview["issuances"][number]): LiquidProcessCtIssuance {
	return { entropy, input: inputId, issuedAsset: asset, reissuanceToken };
}

function parseRequest(params: unknown): ActionRequest {
	const parsed = parseActionRequest(params);

	if (!parsed.ok) {
		throw new WalletRpcInvalidParamsError(
			parsed.malformed.message,
			parsed.malformed.details,
			WALLET_RPC_ERROR_REASONS.INVALID_MANIFEST_REQUEST,
		);
	}

	return parsed.request;
}

/**
 * The wallet's own outputs in one asset, as the review selects from.
 *
 * `getFundingUtxos` answers about every output including the blinded ones, and carries what only
 * this wallet knows: what a blinded output unblinds to, and which key signs for that output. None of that is
 * ever answered to a dapp, which is why it does not travel on the shape `getUTXOs` returns.
 */
function fundable(
	context: LiquidProcessCtContext,
	account: LiquidWalletAccount,
	rawAssetId: string,
): SelectableUtxo[] {
	const held: LiquidFundingUtxo[] = [
		...context.walletBackend.getExplicitUtxos(account, rawAssetId),
		...context.walletBackend.getFundingUtxos(account, rawAssetId),
	];

	const selectable: SelectableUtxo[] = [];

	for (const { blindingSecrets, derivationPath, scriptPubKey, ...utxo } of held) {
		const candidate: SelectableUtxo = { ...utxo, scriptPubKeyHex: scriptPubKey };

		if (blindingSecrets) {
			candidate.blindingSecretsJson = JSON.stringify(blindingSecrets);
		}

		if (derivationPath) {
			candidate.derivationPath = derivationPath;
		}

		selectable.push(candidate);
	}

	return selectable;
}

function signingDerivationPathOf(
	context: LiquidProcessCtContext,
	account: LiquidWalletAccount,
): string {
	return `${EXTERNAL_CHAIN}/${context.walletBackend.getSigningAddress(account).index}`;
}

function requireNetwork(context: LiquidProcessCtContext): string {
	const network = SMPLX_NETWORKS[context.chain.settings.network];

	if (!network) {
		throw new WalletRpcInvalidParamsError(
			`Contract actions are not supported on ${context.chain.settings.network}.`,
			undefined,
			WALLET_RPC_ERROR_REASONS.INVALID_MANIFEST_REQUEST,
		);
	}

	return network;
}
