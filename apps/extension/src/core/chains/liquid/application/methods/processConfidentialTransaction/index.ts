import { createWalletMethod } from "@/core/wallet-methods/createWalletMethod";
import {
	WALLET_RPC_ERROR_REASONS,
	WalletRpcInvalidParamsError,
	WalletRpcNotImplementedError,
} from "@/core/wallet-rpc/errors";
import type { WalletRpcBaseContext } from "@/core/wallet-rpc/types";

import { loadSmplxWasm } from "../../../adapters/smplx/loadSmplxWasm";
import type { LiquidChainRecord } from "../../../chains/LiquidChainRecord";
import { LIQUID_WALLET_RPC_METHODS } from "../../../domain/LiquidRpc";
import { createEsploraTxOutReader } from "../../../domain/manifest/chainRead";
import {
	isRefusal,
	type ManifestReview,
	reviewManifestAction,
} from "../../../domain/manifest/review";
import type { ParsedLiquidProcessCtParams } from "../../../domain/manifest/types";
import { parseLiquidProcessCtParams } from "../../../domain/manifest/validation";

export type LiquidProcessCtContext = WalletRpcBaseContext & {
	chain: LiquidChainRecord;
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
export const processLiquidConfidentialTransaction = createWalletMethod<
	ParsedLiquidProcessCtParams,
	LiquidProcessCtContext,
	ManifestReview,
	never
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
	execute: () => {
		throw new WalletRpcNotImplementedError(
			LIQUID_WALLET_RPC_METHODS.PROCESS_CONFIDENTIAL_TRANSACTION,
			"The contract was verified, but the transaction cannot be built yet: the wasm module exposes compilation and address derivation, not assembly or signing.",
		);
	},
	id: LIQUID_WALLET_RPC_METHODS.PROCESS_CONFIDENTIAL_TRANSACTION,
	parse: parseLiquidProcessCtParams,
	review: async ({ context, params }) => {
		const network = SMPLX_NETWORKS[context.chain.settings.network];

		if (!network) {
			throw new WalletRpcInvalidParamsError(
				`Contract actions are not supported on ${context.chain.settings.network}.`,
				undefined,
				WALLET_RPC_ERROR_REASONS.INVALID_MANIFEST_REQUEST,
			);
		}

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
