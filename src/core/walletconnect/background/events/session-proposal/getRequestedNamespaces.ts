import type { WalletKitTypes } from "@reown/walletkit";

import { normalizeWalletConnectNamespace } from "@/core/walletconnect/namespace-registry";

export function getRequestedNamespaces(
	proposal: WalletKitTypes.SessionProposal["params"],
): string[] {
	const namespaceKeys = [
		...Object.keys(proposal.requiredNamespaces ?? {}),
		...Object.keys(proposal.optionalNamespaces ?? {}),
	];

	return [
		...new Set(namespaceKeys.map(normalizeWalletConnectNamespace).filter(Boolean)),
	].toSorted();
}
