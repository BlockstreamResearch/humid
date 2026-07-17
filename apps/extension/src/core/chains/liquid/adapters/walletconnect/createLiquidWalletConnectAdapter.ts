import type { WalletKitTypes } from "@reown/walletkit";

import { DENY_ALL_AUTHORIZATION } from "@/core/wallet-rpc/types";
import type { WalletConnectNamespaceAdapter } from "@/core/walletconnect/types";

import type { LiquidIdentityBackend } from "../../application/backends/LiquidIdentityBackend";
import type { LiquidWalletBackend } from "../../application/backends/LiquidWalletBackend";
import { createLiquidRpcRouter } from "../../application/createLiquidRpcRouter";
import {
	buildLiquidDappAccountScope,
	resolveAccountGroupIdsForIdentifiers,
} from "../../application/dappAccountScope";
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
			const { approvedScope } = context;

			// A WalletConnect session approves a method surface, never a per-method "run without
			// asking" — the proposal has no permission UI — so every request confirms with the user.
			// The approved accounts still bind execution to the authorized set (via `accountScope`),
			// as on the injected CAIP-25/27 path; an unresolvable scope leaves that binding on the
			// default account, with the confirmation as the gate.
			const accountScope = approvedScope
				? buildLiquidDappAccountScope({
						accountGroupIds: resolveAccountGroupIdsForIdentifiers(
							context.keyManagerState.accountModel,
							chainId,
							approvedScope.accounts,
						),
						accountModel: context.keyManagerState.accountModel,
						chainId,
					})
				: undefined;

			return dispatcher.dispatch(
				{
					method: event.params.request.method,
					params: event.params.request.params,
				},
				{
					...context,
					accountScope,
					authorization: DENY_ALL_AUTHORIZATION,
					chain,
				},
			);
		},
		namespace: LIQUID_NAMESPACE,
	};
}
