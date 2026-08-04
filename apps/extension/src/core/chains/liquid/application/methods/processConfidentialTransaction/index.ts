import type { KeyManagerState, UpdateKeyManagerState } from "@/core/key-manager/types";
import { createWalletMethod } from "@/core/wallet-methods/createWalletMethod";
import {
	WALLET_RPC_ERROR_REASONS,
	WalletRpcInvalidParamsError,
	WalletRpcResourceUnavailableError,
} from "@/core/wallet-rpc/errors";
import type { WalletRpcBaseContext } from "@/core/wallet-rpc/types";

import { getSyncWorkerClient } from "../../../adapters/lwk/sync-worker/createSyncWorkerClient";
import { withAccountMnemonic } from "../../../adapters/lwk/wallet/withAccountMnemonic";
import { loadSmplxWasm } from "../../../adapters/smplx/loadSmplxWasm";
import type { LiquidChainRecord } from "../../../chains/LiquidChainRecord";
import { LIQUID_WALLET_RPC_METHODS } from "../../../domain/LiquidRpc";
import {
	createEsploraFeeRateReader,
	createEsploraTxOutReader,
} from "../../../domain/manifest/chainRead";
import { selectCoins } from "../../../domain/manifest/coinSelection";
import { planAction } from "../../../domain/manifest/plan";
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

/** Confirmation target for the fee estimate, in blocks. */
const FEE_TARGET_BLOCKS = 6;

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
export const processLiquidConfidentialTransaction = createWalletMethod<
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
		const account = await resolveDappAccount(context);
		const plan = planAction(params, requireAction(params));

		if (!plan.ok) {
			throw new WalletRpcInvalidParamsError(
				plan.reason,
				undefined,
				WALLET_RPC_ERROR_REASONS.INVALID_MANIFEST_REQUEST,
			);
		}

		// The fee is the wallet's business: the request carries none, and an action is
		// refused rather than built when no rate can be established.
		const feeRate = await createEsploraFeeRateReader(context.chain.settings.backend)(
			FEE_TARGET_BLOCKS,
		).catch(() => {
			throw new WalletRpcResourceUnavailableError(
				"The wallet could not establish a fee rate, so it will not build this transaction.",
				undefined,
				WALLET_RPC_ERROR_REASONS.RESOURCE_UNAVAILABLE,
			);
		});

		await context.walletBackend.syncAccount(account);

		const selection = selectCoins(
			context.walletBackend.getUtxos(account, account.rawPolicyAssetId),
			plan.plan.fundingSats,
			feeHeadroomSats(feeRate),
		);

		if (!selection.ok) {
			throw new WalletRpcInvalidParamsError(
				selection.reason,
				undefined,
				WALLET_RPC_ERROR_REASONS.INVALID_MANIFEST_REQUEST,
			);
		}

		const smplx = await loadSmplxWasm();
		const covenantAddresses = new Map(
			review.covenants.map((covenant) => [covenant.utxoType, covenant.address]),
		);

		// The mnemonic exists for this call only; `withAccountMnemonic` takes it back.
		const signed = await withAccountMnemonic(
			{
				accountGroupIndex: account.accountGroupIndex,
				chain: context.chain,
				keyManagerState: context.keyManagerState,
			},
			(mnemonic) => {
				const signer = new smplx.WalletSigner(mnemonic, network);
				const builder = new smplx.TransactionBuilder();

				try {
					for (const utxo of selection.selected) {
						builder.addWalletInput(utxo.txid, utxo.vout, utxo.txOut);
					}

					for (const output of plan.plan.outputs) {
						if (output.target.kind === "change" || output.sats === undefined) {
							continue;
						}

						const script =
							output.target.kind === "covenant"
								? covenantAddresses.get(output.target.utxoType)
								: signer.scriptPubKeyHex();

						if (!script) {
							throw new WalletRpcInvalidParamsError(
								`Output ${output.id} pays a covenant the wallet did not verify.`,
								undefined,
								WALLET_RPC_ERROR_REASONS.INVALID_MANIFEST_REQUEST,
							);
						}

						builder.addOutput(script, output.sats, account.rawPolicyAssetId);
					}

					const result = signer.finalizeTransaction(builder, feeRate, signer.scriptPubKeyHex());
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
		const sent = await getSyncWorkerClient().broadcastTransaction({
			chain: account.chain,
			txHex: signed.transactionHex,
		});

		return { broadcast: true, ...signed, txid: sent.txid };
	},
	id: LIQUID_WALLET_RPC_METHODS.PROCESS_CONFIDENTIAL_TRANSACTION,
	parse: parseLiquidProcessCtParams,
	review: async ({ context, params }) => {
		const network = requireNetwork(context);
		const smplx = await loadSmplxWasm();

		const result = await reviewManifestAction(params, {
			compile: ({ argumentsJson, network: target, source }) =>
				new smplx.Contract(source, argumentsJson).covenantAddress(target),
			network,
			readTxOut: createEsploraTxOutReader(context.chain.settings.backend),
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

function requireAction(params: ParsedLiquidProcessCtParams): Record<string, unknown> {
	const actions = params.manifest.actions;
	const action =
		typeof actions === "object" && actions !== null
			? (actions as Record<string, unknown>)[params.action]
			: undefined;

	if (typeof action !== "object" || action === null) {
		throw new WalletRpcInvalidParamsError(
			`The manifest declares no action named "${params.action}".`,
			undefined,
			WALLET_RPC_ERROR_REASONS.INVALID_MANIFEST_REQUEST,
		);
	}

	return action as Record<string, unknown>;
}

/**
 * What to over-select by so the finished transaction can pay its own fee.
 *
 * The real fee comes from the assembled transaction's weight, which does not exist until
 * after selection. A small transaction is on the order of a kilo-vbyte, so one kvb at the
 * chosen rate covers it with room to spare, and whatever is left over comes back as change.
 */
function feeHeadroomSats(feeRateSatsPerKvb: number): bigint {
	return BigInt(Math.ceil(feeRateSatsPerKvb));
}
