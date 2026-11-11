import { SMPLX_COMPILER_VERSION } from "@humid/smplx-compiler";
import {
	createEsploraFeeRateReader,
	createEsploraTxOutReader,
	isRefusal,
	type ManifestReview,
	type ParsedLiquidProcessCtParams,
	parseLiquidProcessCtParams,
	type ReadAddress,
	type ReadFeeRate,
	Refusal,
	type ReadTxOut,
	reviewManifestAction,
	type SelectableUtxo,
	toShownConfirmation,
} from "@humid/tx-manifest";

import { createWalletMethod } from "@/core/wallet-methods/createWalletMethod";
import { WALLET_RPC_ERROR_REASONS, WalletRpcInvalidParamsError } from "@/core/wallet-rpc/errors";

import { createLwkNetwork } from "../../../adapters/lwk/createLwkNetwork";
import { loadLwkWasm } from "../../../adapters/lwk/loadLwkWasm";
import { addressReader } from "../../../adapters/lwk/wallet/readAddress";
import { withAccountMnemonic } from "../../../adapters/lwk/wallet/withAccountMnemonic";
import { assembleReviewedTransaction } from "../../../adapters/smplx/assembleReviewedTransaction";
import {
	createSmplxProgramParamTypes,
	createSmplxProgramCompiler,
	createSmplxScriptPubKeyCompiler,
} from "../../../adapters/smplx/compileProgramWithSmplx";
import { loadSmplxWasm } from "../../../adapters/smplx/loadSmplxWasm";
import type { LiquidChainRecord } from "../../../chains/LiquidChainRecord";
import { LIQUID_WALLET_RPC_METHODS } from "../../../domain/LiquidRpc";
import type { LiquidFundingUtxo, LiquidWalletAccount } from "../../backends/LiquidWalletBackend";
import { resolveDappAccount } from "../../dappAccountScope";
import type { LiquidRpcMethodContext } from "../../LiquidRpcContext";
import { PROCESS_CT_CONFIRMATION_KIND } from "./ProcessCtConfirmation";

export type LiquidProcessCtContext = LiquidRpcMethodContext;

export type LiquidProcessCtResult = {
	broadcast: boolean;
	deployment?: Record<string, string>;
	feeSats: string;
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
	broadcastTransaction: (input: {
		chain: LiquidChainRecord;
		txHex: string;
	}) => Promise<{ txid: string }>;
	loadSmplx: typeof loadSmplxWasm;
	readFeeRate: (chain: LiquidChainRecord) => ReadFeeRate;
	readTxOut: (chain: LiquidChainRecord) => ReadTxOut;
	readAddress: (chain: LiquidChainRecord) => Promise<ReadAddress>;
	resolveAccount: typeof resolveDappAccount;
	withMnemonic: typeof withAccountMnemonic;
};

export const liquidProcessCtDependencies: LiquidProcessCtDependencies = {
	broadcastTransaction: async (input) => {
		const { getSyncWorkerClient } =
			await import("../../../adapters/lwk/sync-worker/createSyncWorkerClient");

		return getSyncWorkerClient().broadcastTransaction(input);
	},
	loadSmplx: loadSmplxWasm,
	readFeeRate: (chain) => createEsploraFeeRateReader(chain.settings.backend),
	readTxOut: (chain) => createEsploraTxOutReader(chain.settings.backend),
	readAddress: async (chain) => {
		const lwk = await loadLwkWasm();

		return addressReader(lwk, createLwkNetwork(lwk, chain));
	},
	resolveAccount: resolveDappAccount,
	withMnemonic: withAccountMnemonic,
};

export const createProcessLiquidConfidentialTransaction = (
	dependencies: LiquidProcessCtDependencies = liquidProcessCtDependencies,
) =>
	createWalletMethod<
		ParsedLiquidProcessCtParams,
		LiquidProcessCtContext,
		ManifestReview,
		LiquidProcessCtResult
	>({
		confirmation: ({ params, review }) => ({
			data: {
				broadcast: params.broadcast,
				kind: PROCESS_CT_CONFIRMATION_KIND,
				shown: toShownConfirmation(review.confirmation),
			},
			message: `A dapp wants to perform "${review.action}" on the ${review.protocol} protocol.`,
			title: "Perform a contract action?",
			timeoutMs: 5 * 60_000,
		}),
		execute: async ({ context, params, review }) => {
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
			const deployment =
				review.createdInstance === undefined ? {} : { deployment: review.createdInstance.fields };

			if (!params.broadcast) {
				return { broadcast: false, ...deployment, ...result };
			}

			const sent = await dependencies.broadcastTransaction({
				chain: account.chain,
				txHex: result.transactionHex,
			});

			return { broadcast: true, ...deployment, ...result, txid: sent.txid };
		},
		id: LIQUID_WALLET_RPC_METHODS.PROCESS_CONFIDENTIAL_TRANSACTION,
		parse: parseRequest,
		review: async ({ context, params }) => {
			const network = requireNetwork(context);
			const account = await dependencies.resolveAccount(context);
			const smplx = await dependencies.loadSmplx();

			await context.walletBackend.syncAccount(account);

			const readAddress = await dependencies.readAddress(context.chain);
			const result = await reviewManifestAction(params, {
				accountLabel: accountLabelOf(context, account),
				compile: createSmplxProgramCompiler(smplx),
				compilerVersion: SMPLX_COMPILER_VERSION,
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
				programParamTypes: createSmplxProgramParamTypes(smplx),
				fundingUtxos: fundable(context, account, account.rawPolicyAssetId),
				holdingsOf: (asset) => fundable(context, account, asset),
				network,
				policyAsset: account.rawPolicyAssetId,
				readAddress,
				readChainTip: async () => context.walletBackend.getTipHeight(account),
				readFeeRate: dependencies.readFeeRate(context.chain),
				readTxOut: dependencies.readTxOut(context.chain),
				scriptPubKeyOf: createSmplxScriptPubKeyCompiler(smplx, network),
				walletScriptPubKeyHex: readAddress(context.walletBackend.getSigningAddress(account).address)
					.scriptPubKeyHex,
			});

			if (isRefusal(result)) {
				throw new WalletRpcInvalidParamsError(
					result.reason,
					{ reject: result.reject },
					WALLET_RPC_ERROR_REASONS.INVALID_MANIFEST_REQUEST,
				);
			}

			return result;
		},
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

function parseRequest(params: unknown): ParsedLiquidProcessCtParams {
	const parsed = parseLiquidProcessCtParams(params);

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

	for (const { blindingSecrets, derivationPath, ...utxo } of held) {
		const candidate: SelectableUtxo = utxo;

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

function accountLabelOf(context: LiquidProcessCtContext, account: LiquidWalletAccount): string {
	return `${account.chain?.id ?? context.chain.id} account ${account.accountGroupIndex ?? 0}`;
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
