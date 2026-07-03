import { getSecureVaultStatus } from "@/core/secure-vault/background";

import { getRegisteredWalletConnectNamespaces } from "../namespace-registry";
import { getWalletKitClientState } from "./state";

// Wallet provider events a WalletConnect session can carry — must be advertised in the session's
// namespace `events` (see LIQUID_WALLETCONNECT_EVENTS). Others are dropped: WalletConnect rejects an
// event a session never negotiated. `wallet_sessionChanged` is injected-only (not chain-scoped);
// `bip122_walletDescriptorChanged` is advertised but its emission is deferred.
const WC_DELIVERABLE_EVENTS = new Set(["accountsChanged", "chainChanged"]);

/** The CAIP-2 chains a namespace scope covers: its `chains`, or those derived from its accounts. */
function chainsForScope(scope: { accounts: string[]; chains?: string[] }): string[] {
	if (scope.chains && scope.chains.length > 0) return scope.chains;

	return [...new Set(scope.accounts.map((account) => account.split(":").slice(0, 2).join(":")))];
}

/**
 * Emit a wallet provider event to every active WalletConnect session that negotiated it. Unlike the
 * global injected broadcast bus, WalletConnect is point-to-point, so each session receives its own
 * chain-scoped payload: `chainChanged` carries the new chain id; `accountsChanged` carries the
 * session's authorized accounts for the chain (an empty list while the vault is locked — the wallet
 * serves nothing then). No-op until the WalletConnect client is up. Best-effort per session; a failed
 * emit is swallowed so one dead session can't block the others (or the state change that triggered it).
 *
 * v1 does not reorder `accountsChanged` by the wallet's selected account (Model B); a WalletConnect
 * dapp sees its fixed authorized set. Reordering is a follow-up.
 */
export async function emitWalletConnectWalletEvent(
	name: string,
	payload: { chainId?: string },
): Promise<void> {
	if (!WC_DELIVERABLE_EVENTS.has(name)) return;

	const walletKit = getWalletKitClientState();

	if (!walletKit) return;

	const sessions = Object.values(walletKit.getActiveSessions());

	if (sessions.length === 0) return;

	const namespaces = getRegisteredWalletConnectNamespaces();
	// accountsChanged reflects reachability: while locked the wallet serves no accounts.
	const unlocked = name === "accountsChanged" ? (await getSecureVaultStatus()).isUnlocked : true;

	await Promise.all(
		sessions.flatMap((session) =>
			namespaces.flatMap((namespace) => {
				const scope = session.namespaces[namespace];

				if (!scope || !scope.events.includes(name)) return [];

				const scopeChains = chainsForScope(scope);
				const chains =
					name === "chainChanged"
						? payload.chainId && scopeChains.includes(payload.chainId)
							? [payload.chainId]
							: []
						: scopeChains;

				return chains.map((chainId) => {
					const data =
						name === "chainChanged"
							? chainId
							: unlocked
								? scope.accounts.filter((account) => account.startsWith(`${chainId}:`))
								: [];

					return walletKit
						.emitSessionEvent({ chainId, event: { data, name }, topic: session.topic })
						.catch(() => undefined);
				});
			}),
		),
	);
}
