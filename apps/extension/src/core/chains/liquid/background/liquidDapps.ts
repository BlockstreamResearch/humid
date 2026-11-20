import type { Caip25Scopes } from "@/core/caip25";
import { addUnlockedChainRecord } from "@/core/chains/application/chain-store/addChainRecord";
import { getUnlockedChainStoreState } from "@/core/chains/application/chain-store/secureChainStore";
import type { ConfirmationResponder } from "@/core/extension-background/confirmations";
import type { DappAuthorizationDependencies } from "@/core/extension-background/dapp-authorization";
import { walletVaultBackground } from "@/core/secure-vault/application/wallet-vault/background";

import { buildLiquidDappAccountScope } from "../application/dappAccountScope";
import { generateCustomLiquidChainId } from "../chains/createBuiltInLiquidChains";
import { LIQUID_CHAIN_GROUP_ID, parseLiquidChainRecord } from "../chains/LiquidChainRecord";
import { resolveUnlockedLiquidChain } from "../chains/resolveLiquidChain";
import type { LiquidChainGroup } from "../contract";
import { LIQUID_WALLETCONNECT_EVENTS } from "../domain/LiquidRpc";
import { parseLiquidChainId } from "../domain/validation";
import type { LiquidAccounts } from "./liquidAccounts";
import type { LiquidPortfolio } from "./liquidPortfolio";

export function createLiquidDapps({
	accounts,
	chainGroup,
	confirm,
	portfolio,
}: {
	accounts: LiquidAccounts;
	chainGroup: LiquidChainGroup;
	confirm: ConfirmationResponder["confirm"];
	portfolio: LiquidPortfolio;
}): Pick<
	DappAuthorizationDependencies,
	| "dispatch"
	| "prepareChainAddition"
	| "resolveConnectedAccountIds"
	| "resolveKnownChain"
	| "resolveSupportedScope"
> {
	const { keyManager } = walletVaultBackground;

	const knownChainNames = async (): Promise<Map<string, string>> => {
		const known = new Map(chainGroup.chains.map((chain) => [chain.id, chain.name]));

		try {
			for (const chain of Object.values((await getUnlockedChainStoreState()).chains)) {
				if (chain.chainGroupId === chainGroup.id && !known.has(chain.id)) {
					known.set(chain.id, chain.name);
				}
			}
		} catch {}

		return known;
	};

	return {
		async dispatch({ accountGroupIds, chainId, grantedMethods, method, origin, params }) {
			const liquidChainId = parseLiquidChainId(chainId);
			const chain = await resolveUnlockedLiquidChain(liquidChainId);
			const keyManagerState = keyManager.getState();

			return chainGroup.walletRpcDispatcher.dispatch(
				{ method, params },
				{
					accountScope: buildLiquidDappAccountScope({
						accountGroupIds,
						accountModel: keyManagerState.accountModel,
						chainId: liquidChainId,
					}),
					authorization: { isGranted: (methodId) => grantedMethods[methodId] === true },
					chain,
					confirm,
					keyManagerState,
					readPortfolioSnapshot: portfolio.readSnapshot,
					requester: { origin },
					updateKeyManagerState: keyManager.updateState,
				},
			);
		},

		prepareChainAddition(params) {
			const proposal =
				params && typeof params === "object" ? (params as Record<string, unknown>) : {};
			const chain = parseLiquidChainRecord({
				chainGroupId: LIQUID_CHAIN_GROUP_ID,
				id: generateCustomLiquidChainId(),
				name: proposal.name,
				settings: proposal.settings,
			});

			return {
				backendUrl: chain.settings.backend.url,
				name: chain.name,
				network: chain.settings.network,
				async commit() {
					await addUnlockedChainRecord(chain, [chainGroup]);

					return chain.id;
				},
			};
		},

		resolveConnectedAccountIds: (chainId, accountGroupIds) =>
			accounts.identifiersOf(chainId, accountGroupIds),

		async resolveKnownChain(chainId) {
			const name = (await knownChainNames()).get(chainId);

			return name === undefined ? null : { name };
		},

		async resolveSupportedScope(requested: Caip25Scopes) {
			const supportedMethods = chainGroup.walletRpcDispatcher.methods;
			const known = await knownChainNames();
			const chains = new Set<string>();
			const methods = new Set<string>();

			for (const [scopeString, scopeObject] of Object.entries(requested)) {
				let chainId: string;

				try {
					chainId = parseLiquidChainId(scopeString);
				} catch {
					continue;
				}

				if (!known.has(chainId)) continue;

				chains.add(chainId);

				for (const method of scopeObject.methods) {
					if (supportedMethods.includes(method)) methods.add(method);
				}
			}

			return {
				chains: [...chains],
				events: [...LIQUID_WALLETCONNECT_EVENTS],
				methods: [...methods],
			};
		},
	};
}
