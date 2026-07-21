import { LIQUID_IDENTITY_CURVE, type WalletClient } from "@humid/appkit-injected-adapter";
import { useQuery } from "@tanstack/react-query";

import { deriveDataStatus, type DataStatus } from "./status";

export const HUMID_IDENTITY_QUERY_KEY = ["humid", "identity"] as const;

/** The identity a dapp derives to personalize itself for the connected wallet (identity-first). */
export const DEFAULT_IDENTITY = "ssh://humid@localhost";

export type HumidIdentity = {
	publicKey: string;
	/** Short human-readable name derived from the identity URI (falls back to a key fingerprint). */
	label: string;
};

export type HumidIdentityState = {
	identity: HumidIdentity | null;
	status: DataStatus;
	/** Derive now regardless of policy (prompts when the method is not silent). */
	refresh: () => void;
};

/**
 * The wallet's SLIP-0013 identity public key for {@link DEFAULT_IDENTITY}, used to personalize the
 * dapp. Same policy-aware gating as the balance: auto-derives only when connected and
 * `getIdentityPublicKey` is silent, otherwise `needs-approval` until `refresh` is called.
 */
export function useHumidIdentity(args: {
	wallet: WalletClient;
	chainId: string;
	isConnected: boolean;
	silent: boolean;
}): HumidIdentityState {
	const { wallet, chainId, isConnected, silent } = args;

	const query = useQuery({
		queryKey: [...HUMID_IDENTITY_QUERY_KEY, chainId],
		enabled: isConnected && silent,
		queryFn: async (): Promise<HumidIdentity> => {
			const result = await wallet.getIdentityPublicKey({
				curve: LIQUID_IDENTITY_CURVE,
				identity: DEFAULT_IDENTITY,
			});

			return {
				publicKey: result.publicKey,
				label: deriveIdentityLabel(result.identity, result.publicKey),
			};
		},
		staleTime: Infinity,
	});

	return {
		identity: query.data ?? null,
		status: deriveDataStatus(query, { connected: isConnected, silent }),
		refresh: () => {
			void query.refetch();
		},
	};
}

/** `ssh://humid@localhost` → `humid@localhost`; falls back to a short public-key fingerprint. */
function deriveIdentityLabel(identity: string, publicKey: string): string {
	const withoutScheme = identity.replace(/^[a-z0-9+.-]+:\/\//i, "").replace(/\/+$/, "");
	if (withoutScheme) return withoutScheme;

	return publicKey.length <= 12 ? publicKey : `${publicKey.slice(0, 6)}…${publicKey.slice(-4)}`;
}
