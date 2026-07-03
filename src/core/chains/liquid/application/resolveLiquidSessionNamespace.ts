import { resolveUnlockedLiquidChain } from "../chains/resolveLiquidChain";
import { LIQUID_CHAIN_IDS, LIQUID_NAMESPACE, type LiquidChainId } from "../domain/LiquidChain";
import { LIQUID_WALLETCONNECT_EVENTS } from "../domain/LiquidRpc";
import { parseLiquidChainId } from "../domain/validation";
import type {
	LiquidWalletBackend,
	ResolveLiquidWalletAccountInput,
} from "./backends/LiquidWalletBackend";

type WalletConnectNamespaceRequest = {
	chains?: string[];
	events?: string[];
	methods?: string[];
};

export type LiquidSessionNamespaceProposal = {
	optionalNamespaces?: Record<string, WalletConnectNamespaceRequest>;
	requiredNamespaces?: Record<string, WalletConnectNamespaceRequest>;
};

export type ResolveLiquidSessionNamespaceInput = {
	/** The RPC methods to advertise for this namespace (the router's registered methods). */
	methods: readonly string[];
	proposal: LiquidSessionNamespaceProposal;
	walletBackend: LiquidWalletBackend;
	walletContext: Omit<ResolveLiquidWalletAccountInput, "chain">;
};

export async function resolveLiquidSessionNamespace({
	methods,
	proposal,
	walletBackend,
	walletContext,
}: ResolveLiquidSessionNamespaceInput) {
	const chainIds = getRequestedLiquidChainIds(proposal);
	const accountIdentifiers = (
		await Promise.all(
			chainIds.map(async (chainId) => {
				try {
					const chain = await resolveUnlockedLiquidChain(chainId);
					const account = await walletBackend.resolveAccount({
						...walletContext,
						chain,
					});

					return account.accountIdentifier;
				} catch {
					// A chain is advertised only when the current vault can derive a real account for it.
					return null;
				}
			}),
		)
	).filter((accountIdentifier) => accountIdentifier !== null);

	if (accountIdentifiers.length === 0) {
		return null;
	}

	return {
		accounts: accountIdentifiers,
		chains: chainIds.filter((chainId) =>
			accountIdentifiers.some((accountIdentifier) => accountIdentifier.startsWith(`${chainId}:`)),
		),
		events: [...LIQUID_WALLETCONNECT_EVENTS],
		methods: [...methods],
	};
}

function getRequestedLiquidChainIds(proposal: LiquidSessionNamespaceProposal): LiquidChainId[] {
	const requestedChains = new Set<string>();

	for (const [namespaceKey, namespace] of getNamespaceRequests(proposal)) {
		const normalizedNamespace = namespaceKey.split(":")[0];

		if (normalizedNamespace !== LIQUID_NAMESPACE) continue;

		if (namespaceKey.includes(":")) {
			requestedChains.add(namespaceKey);
		}

		for (const chain of namespace.chains ?? []) {
			requestedChains.add(chain);
		}
	}

	if (requestedChains.size === 0) {
		return [...LIQUID_CHAIN_IDS];
	}

	return [...requestedChains]
		.flatMap((chainId) => {
			try {
				return [parseLiquidChainId(chainId)];
			} catch {
				return [];
			}
		})
		.filter((chainId, index, chainIds) => chainIds.indexOf(chainId) === index);
}

function getNamespaceRequests(
	proposal: LiquidSessionNamespaceProposal,
): Array<[string, WalletConnectNamespaceRequest]> {
	return [
		...Object.entries(proposal.requiredNamespaces ?? {}),
		...Object.entries(proposal.optionalNamespaces ?? {}),
	];
}
