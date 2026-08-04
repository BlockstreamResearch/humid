import type { KeyManagerState, UpdateKeyManagerState } from "@/core/key-manager/types";
import { createWalletMethod } from "@/core/wallet-methods/createWalletMethod";
import { WALLET_RPC_ERROR_REASONS, WalletRpcInvalidParamsError } from "@/core/wallet-rpc/errors";
import type { WalletRpcBaseContext } from "@/core/wallet-rpc/types";

import { toScriptPubKeyHex } from "../../../adapters/lwk/wallet/toScriptPubKeyHex";
import { withAccountMnemonic } from "../../../adapters/lwk/wallet/withAccountMnemonic";
import { loadSmplxWasm } from "../../../adapters/smplx/loadSmplxWasm";
import type { LiquidChainRecord } from "../../../chains/LiquidChainRecord";
import { LIQUID_WALLET_RPC_METHODS } from "../../../domain/LiquidRpc";
import {
	createEsploraFeeRateReader,
	createEsploraTxOutReader,
	type ReadFeeRate,
	type ReadTxOut,
} from "../../../domain/manifest/chainRead";
import {
	isRefusal,
	type ManifestReview,
	reviewManifestAction,
} from "../../../domain/manifest/review";
import type { ParsedLiquidProcessCtParams } from "../../../domain/manifest/types";
import { parseLiquidProcessCtParams } from "../../../domain/manifest/validation";
import type { LiquidWalletBackend } from "../../backends/LiquidWalletBackend";
import { resolveDappAccount } from "../../dappAccountScope";

export type LiquidProcessCtContext = WalletRpcBaseContext & {
	chain: LiquidChainRecord;
	keyManagerState: KeyManagerState;
	updateKeyManagerState?: UpdateKeyManagerState;
	walletBackend: LiquidWalletBackend;
};

export type LiquidProcessCtResult = {
	broadcast: boolean;
	feeSats: string;
	transactionHex: string;
	txid: string;
};

/** The network names the SDK understands, keyed by the wallet's own network kind. */
const SMPLX_NETWORKS: Record<string, string> = {
	mainnet: "liquid",
	regtest: "elements-regtest",
	testnet: "liquid-testnet",
};

/**
 * Performs one action of a txManifest protocol. The site sends the manifest, the sources
 * of the contracts it references, the chosen action and its filled parameters; everything
 * else happens inside the extension.
 *
 * The wallet establishes for itself that each contract is the one the site describes: it
 * rebuilds every covenant from source, and for one being spent compares the derived
 * address against what the chain says is at that outpoint. A mismatch refuses, and there
 * is no way to click through it.
 *
 * That check lives in `review` deliberately. `review` runs before the permission gate, so
 * a standing permission — which skips the prompt entirely — cannot skip the verification
 * with it.
 */
/**
 * Everything the method reaches outside itself.
 *
 * Named as one object so the whole seam — parse, verify, plan, sign, broadcast — can be
 * driven in a test. Without this the only way to exercise the method is to build the
 * extension and run it, which is why nothing did.
 */
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

/** How the method is wired in the extension. Tests substitute what they need. */
export const liquidProcessCtDependencies: LiquidProcessCtDependencies = {
	// Imported when a transaction is actually broadcast rather than at module load: the
	// sync-worker client reaches for `webextension-polyfill`, which throws outside an
	// extension, and nothing else in this method needs a browser.
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
				action: review.action,
				broadcast: params.broadcast,
				// Every covenant the wallet rebuilt, with what it established about each.
				// `not-yet-on-chain` marks one being created, which there is nothing to compare
				// against — it is a different fact, not a weaker form of verified.
				covenants: review.covenants,
				kind: "liquid.processConfidentialTransaction",
				protocol: review.protocol,
			},
			message: `A site wants to perform "${review.action}" on the ${review.protocol} protocol.`,
			title: "Perform a contract action?",
		}),
		execute: async ({ context, params, review }) => {
			const network = requireNetwork(context);
			const account = await dependencies.resolveAccount(context);
			const smplx = await dependencies.loadSmplx();

			// Everything except signing was settled in `review`, before the person was asked.
			// What gets signed here is the transaction they were shown, not one reassembled
			// afterwards from the same inputs.
			const signed = await dependencies.withMnemonic(
				{
					accountGroupIndex: account.accountGroupIndex,
					chain: context.chain,
					keyManagerState: context.keyManagerState,
				},
				(mnemonic) => {
					const signer = new smplx.WalletSigner(mnemonic, network);
					const builder = new smplx.TransactionBuilder();

					try {
						// Covenant inputs first: the manifest's own input order is what a covenant
						// introspects, and wallet inputs are the wallet's addition to it.
						for (const covenant of review.covenantInputs) {
							builder.addCovenantInput(
								covenant.txid,
								covenant.vout,
								covenant.txOutHex,
								covenant.source,
								covenant.argumentsJson,
								// No witness values: a covenant that authenticates its spender needs a
								// signature over this transaction, which only the signer can make, and
								// naming it is what asks for one.
								undefined,
								covenant.signatureWitness,
							);
						}

						for (const utxo of review.selected) {
							builder.addWalletInput(utxo.txid, utxo.vout, utxo.txOut);
						}

						for (const output of review.outputs) {
							builder.addOutput(output.scriptPubKeyHex, output.sats, account.rawPolicyAssetId);
						}

						const result = signer.finalizeTransaction(
							builder,
							review.feeRateSatsPerKvb,
							signer.scriptPubKeyHex(),
						);
						const extracted = {
							feeSats: result.feeSats.toString(),
							transactionHex: result.hex,
							txid: result.txid,
						};

						result.free();

						return extracted;
					} finally {
						builder.free();
						signer.free();
					}
				},
			);

			if (!params.broadcast) {
				return { broadcast: false, ...signed };
			}

			// LWK's Esplora client needs a `window` the service worker does not have, so the
			// finished transaction crosses into the offscreen document to go out. Nothing else
			// crosses: it is already signed.
			const sent = await dependencies.broadcastTransaction({
				chain: account.chain,
				txHex: signed.transactionHex,
			});

			return { broadcast: true, ...signed, txid: sent.txid };
		},
		id: LIQUID_WALLET_RPC_METHODS.PROCESS_CONFIDENTIAL_TRANSACTION,
		parse: parseLiquidProcessCtParams,
		review: async ({ context, params }) => {
			const network = requireNetwork(context);
			const account = await dependencies.resolveAccount(context);
			const smplx = await dependencies.loadSmplx();

			await context.walletBackend.syncAccount(account);

			const result = await reviewManifestAction(params, {
				compile: ({ argumentsJson, extraLeavesJson, network: target, source }) =>
					new smplx.Contract(source, argumentsJson, extraLeavesJson).covenantAddress(target),
				scriptPubKeyOf: ({ argumentsJson, source }) =>
					new smplx.Contract(source, argumentsJson).scriptPubKeyHex(network),
				fundingUtxos: context.walletBackend.getUtxos(account, account.rawPolicyAssetId),
				network,
				readFeeRate: dependencies.readFeeRate(context.chain),
				readTxOut: dependencies.readTxOut(context.chain),
				walletScriptPubKeyHex: await dependencies.scriptPubKeyHexOf(
					context.walletBackend.getReceiveAddress(account).address,
				),
			});

			if (isRefusal(result)) {
				throw new WalletRpcInvalidParamsError(
					result.reason,
					undefined,
					WALLET_RPC_ERROR_REASONS.INVALID_MANIFEST_REQUEST,
				);
			}

			return result;
		},
	});

export const processLiquidConfidentialTransaction = createProcessLiquidConfidentialTransaction();

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
