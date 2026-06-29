import type { WalletKitTypes } from "@reown/walletkit";

import type { WalletConnectNamespaceAdapter } from "@/core/walletconnect/types";

import { createLiquidRpcRouter } from "../../application/createLiquidRpcRouter";
import { resolveLiquidSessionNamespace } from "../../application/resolveLiquidSessionNamespace";
import { LIQUID_NAMESPACE } from "../../domain/LiquidChain";
import { parseLiquidChainId } from "../../domain/validation";
import type { LiquidWalletBackend } from "../../ports/LiquidWalletBackend";

export type CreateLiquidWalletConnectAdapterInput = {
	walletBackend: LiquidWalletBackend;
};

export function createLiquidWalletConnectAdapter({
	walletBackend,
}: CreateLiquidWalletConnectAdapterInput): WalletConnectNamespaceAdapter {
	const dispatcher = createLiquidRpcRouter(walletBackend);

	return {
		getSupportedNamespace: async (proposal: WalletKitTypes.SessionProposal["params"], context) => {
			const namespace = await resolveLiquidSessionNamespace({
				proposal,
				walletBackend,
				walletContext: {
					keyManagerState: context.keyManagerState,
				},
			});

			if (!namespace || dispatcher.methods.length === 0) {
				return null;
			}

			return namespace;
		},
		handleSessionRequest: (event, context) => {
			const chainId = parseLiquidChainId(event.params.chainId);

			return dispatcher.dispatch(
				{
					method: event.params.request.method,
					params: event.params.request.params,
				},
				{
					...context,
					chainId,
				},
			);
		},
		namespace: LIQUID_NAMESPACE,
	};
}
