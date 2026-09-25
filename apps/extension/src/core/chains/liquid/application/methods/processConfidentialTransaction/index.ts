import { SMPLX_COMPILER_VERSION } from "@humid/smplx-compiler";
import {
	createEsploraFeeRateReader,
	createEsploraTxOutReader,
	isRefusal,
	type ManifestReview,
	type ParsedLiquidProcessCtParams,
	parseLiquidProcessCtParams,
	type ReadFeeRate,
	type ReadTxOut,
	reviewManifestAction,
	type SelectableUtxo,
	toShownConfirmation,
} from "@humid/tx-manifest";

import { createWalletMethod } from "@/core/wallet-methods/createWalletMethod";
import { WALLET_RPC_ERROR_REASONS, WalletRpcInvalidParamsError } from "@/core/wallet-rpc/errors";

import { toScriptPubKeyHex } from "../../../adapters/lwk/wallet/toScriptPubKeyHex";
import { withAccountMnemonic } from "../../../adapters/lwk/wallet/withAccountMnemonic";
import { assembleReviewedTransaction } from "../../../adapters/smplx/assembleReviewedTransaction";
import {
	createSmplxCovenantParamTypes,
	createSmplxCovenantCompiler,
	createSmplxScriptPubKeyCompiler,
} from "../../../adapters/smplx/compileCovenantWithSmplx";
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
	resolveAccount: typeof resolveDappAccount;
	scriptPubKeyHexOf: (address: string) => Promise<string>;
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
	resolveAccount: resolveDappAccount,
	scriptPubKeyHexOf: toScriptPubKeyHex,
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
		}),
		execute: async ({ context, params, review }) => {
			const network = requireNetwork(context);
			const account = await dependencies.resolveAccount(context);
			const smplx = await dependencies.loadSmplx();

			const assembled = await dependencies.withMnemonic(
				{
					...(account.accountGroupIndex === undefined
						? {}
						: { accountGroupIndex: account.accountGroupIndex }),
					chain: context.chain,
					keyManagerState: context.keyManagerState,
					...(account.keySourceId === undefined ? {} : { keySourceId: account.keySourceId }),
				},
				async (mnemonic) => {
					const signer = new smplx.WalletSigner(mnemonic, network);

					try {
						return await assembleReviewedTransaction(review, {
							blindingPublicKeyHex: signer.blindingPublicKey(),
							changeScriptPubKeyHex: signer.scriptPubKeyHex(),
							finalize: (builder, feeRateSatsPerKvb) => {
								const result = signer.finalizeTransaction(
									builder as InstanceType<typeof smplx.TransactionBuilder>,
									feeRateSatsPerKvb,
								);

								try {
									return { feeSats: result.feeSats, hex: result.hex, txid: result.txid };
								} finally {
									result.free();
								}
							},
							signingDerivationPath: signingDerivationPathOf(context, account),
							smplx,
						});
					} finally {
						signer.free();
					}
				},
			);

			if (!assembled.ok) {
				throw new WalletRpcInvalidParamsError(
					assembled.reason,
					{ reject: assembled.reject },
					WALLET_RPC_ERROR_REASONS.INVALID_MANIFEST_REQUEST,
				);
			}

			const { feeSats, hex, txid } = assembled.transaction;
			const signed = { feeSats: feeSats.toString(), transactionHex: hex, txid };
			const deployment =
				review.createdInstance === undefined ? {} : { deployment: review.createdInstance.fields };

			if (!params.broadcast) {
				return { broadcast: false, ...deployment, ...signed };
			}

			const sent = await dependencies.broadcastTransaction({
				chain: account.chain,
				txHex: signed.transactionHex,
			});

			return { broadcast: true, ...deployment, ...signed, txid: sent.txid };
		},
		id: LIQUID_WALLET_RPC_METHODS.PROCESS_CONFIDENTIAL_TRANSACTION,
		parse: parseRequest,
		review: async ({ context, params }) => {
			const network = requireNetwork(context);
			const account = await dependencies.resolveAccount(context);
			const smplx = await dependencies.loadSmplx();

			await context.walletBackend.syncAccount(account);

			const result = await reviewManifestAction(params, {
				accountLabel: accountLabelOf(context, account),
				compile: createSmplxCovenantCompiler(smplx),
				compilerVersion: SMPLX_COMPILER_VERSION,
				covenantParamTypes: createSmplxCovenantParamTypes(smplx),
				fundingUtxos: fundable(context, account, account.rawPolicyAssetId),
				holdingsOf: (asset) => fundable(context, account, asset),
				network,
				policyAsset: account.rawPolicyAssetId,
				readChainTip: async () => context.walletBackend.getTipHeight(account),
				readFeeRate: dependencies.readFeeRate(context.chain),
				readTxOut: dependencies.readTxOut(context.chain),
				scriptPubKeyOf: createSmplxScriptPubKeyCompiler(smplx, network),
				walletScriptPubKeyHex: await dependencies.scriptPubKeyHexOf(
					context.walletBackend.getSigningAddress(account).address,
				),
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
 * this wallet knows: what a blinded output unblinds to, and which key signs it. None of that is
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
