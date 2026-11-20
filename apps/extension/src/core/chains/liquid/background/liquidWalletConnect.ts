import type { AccountModelState } from "@/core/accounts/application/account-registry/model/account-model";
import type { DappSessionsHandlersDependencies } from "@/core/extension-background/dapp-authorization";
import type { CreateInternalRpcHandlersInput } from "@/core/extension-background/internal-rpc";
import { logger } from "@/core/logger";
import * as walletConnect from "@/core/walletconnect/background";
import type { WalletConnectSessionSummary } from "@/core/walletconnect/types";

import { resolveAccountGroupIdsForIdentifiers } from "../application/dappAccountScope";
import { parseLiquidChainId } from "../domain/validation";

const listWalletConnectSessions = (): WalletConnectSessionSummary[] =>
	walletConnect.getWalletConnectStatus().sessions;

const disconnectWalletConnect = async (topic: string): Promise<void> => {
	await walletConnect.disconnectWalletConnectSession({ topic });
};

export function createLiquidWalletConnect(
	getAccountModel: () => AccountModelState | null,
): Pick<
	DappSessionsHandlersDependencies,
	"disconnectWalletConnect" | "listWalletConnectSessions" | "resolveWalletConnectAccountGroupIds"
> &
	Pick<CreateInternalRpcHandlersInput, "purgeAccountWalletConnectSessions"> {
	const resolveWalletConnectAccountGroupIds = (session: WalletConnectSessionSummary): string[] => {
		const accountModel = getAccountModel();

		if (!accountModel) return [];

		const accountsByChain = new Map<string, string[]>();

		for (const scope of Object.values(session.namespaces)) {
			for (const account of scope.accounts) {
				const chainId = account.split(":").slice(0, 2).join(":");

				accountsByChain.set(chainId, [...(accountsByChain.get(chainId) ?? []), account]);
			}
		}

		const accountGroupIds = new Set<string>();

		for (const [chainId, accounts] of accountsByChain) {
			let liquidChainId;

			try {
				liquidChainId = parseLiquidChainId(chainId);
			} catch {
				continue;
			}

			for (const groupId of resolveAccountGroupIdsForIdentifiers(
				accountModel,
				liquidChainId,
				accounts,
			)) {
				accountGroupIds.add(groupId);
			}
		}

		return [...accountGroupIds];
	};

	return {
		disconnectWalletConnect,
		listWalletConnectSessions,

		async purgeAccountWalletConnectSessions(accountGroupIds) {
			const removed = new Set(accountGroupIds);

			if (removed.size === 0) return;

			const topicsToDisconnect: string[] = [];

			for (const session of listWalletConnectSessions()) {
				const authorized = resolveWalletConnectAccountGroupIds(session);

				if (!authorized.some((id) => removed.has(id))) continue;

				if (authorized.length === 1) {
					topicsToDisconnect.push(session.topic);
				} else {
					logger.warn(
						"[walletconnect] a session authorizing several accounts stays after one is removed",
						{ topic: session.topic },
					);
				}
			}

			await Promise.all(
				topicsToDisconnect.map((topic) =>
					disconnectWalletConnect(topic).catch((error) =>
						logger.warn("[walletconnect] could not disconnect a session", { error, topic }),
					),
				),
			);
		},

		resolveWalletConnectAccountGroupIds,
	};
}
