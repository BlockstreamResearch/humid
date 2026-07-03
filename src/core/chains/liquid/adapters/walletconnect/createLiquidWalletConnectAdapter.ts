import type { WalletKitTypes } from "@reown/walletkit";

import type { WalletConnectNamespaceAdapter } from "@/core/walletconnect/types";

import type { LiquidIdentityBackend } from "../../application/backends/LiquidIdentityBackend";
import type { LiquidWalletBackend } from "../../application/backends/LiquidWalletBackend";
import { createLiquidRpcRouter } from "../../application/createLiquidRpcRouter";
import { resolveLiquidSessionNamespace } from "../../application/resolveLiquidSessionNamespace";
import { resolveUnlockedLiquidChain } from "../../chains/resolveLiquidChain";
import { LIQUID_NAMESPACE } from "../../domain/LiquidChain";
import { parseLiquidChainId } from "../../domain/validation";

export type CreateLiquidWalletConnectAdapterInput = {
	identityBackend: LiquidIdentityBackend;
	walletBackend: LiquidWalletBackend;
};

export function createLiquidWalletConnectAdapter({
	identityBackend,
	walletBackend,
}: CreateLiquidWalletConnectAdapterInput): WalletConnectNamespaceAdapter {
	const dispatcher = createLiquidRpcRouter({
		identityBackend,
		walletBackend,
	});

	return {
		getSupportedNamespace: async (proposal: WalletKitTypes.SessionProposal["params"], context) => {
			const namespace = await resolveLiquidSessionNamespace({
				methods: dispatcher.methods,
				proposal,
				walletBackend,
				walletContext: {
					keyManagerState: context.keyManagerState,
					updateKeyManagerState: context.updateKeyManagerState,
				},
			});

			if (!namespace || dispatcher.methods.length === 0) {
				return null;
			}

			return namespace;
		},
		handleSessionRequest: async (event, context) => {
			const chainId = parseLiquidChainId(event.params.chainId);
			const chain = await resolveUnlockedLiquidChain(chainId);

			return dispatcher.dispatch(
				{
					method: event.params.request.method,
					params: event.params.request.params,
				},
				{
					...context,
					chain,
				},
			);
		},
		namespace: LIQUID_NAMESPACE,
	};
}
