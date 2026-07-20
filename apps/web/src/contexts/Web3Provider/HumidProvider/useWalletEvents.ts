import {
	LIQUID_DESCRIPTOR_CHANGED_EVENT,
	type CaipRpcProvider,
} from "@humid/appkit-injected-adapter";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { HUMID_BALANCE_QUERY_KEY } from "./useHumidBalance";
import { HUMID_IDENTITY_QUERY_KEY } from "./useHumidIdentity";
import { HUMID_SESSION_QUERY_KEY } from "./useHumidSession";

// The wallet-side changes that make our cached reads stale: account / chain switch, lock-unlock or
// revoke (session), and a descriptor change. Each pushes an event on window.humid; we invalidate the
// dependent queries so they re-read instead of waiting for the next poll.
const WALLET_EVENTS = [
	"accountsChanged",
	"chainChanged",
	LIQUID_DESCRIPTOR_CHANGED_EVENT,
	"wallet_sessionChanged",
] as const;

/**
 * Bridge window.humid events into react-query cache invalidation. On any wallet-side change, mark the
 * session, balance, and identity queries stale so they refetch reactively (subject to their own policy
 * gating) rather than only on their poll interval.
 */
export function useWalletEvents(provider: CaipRpcProvider | null): void {
	const queryClient = useQueryClient();

	useEffect(() => {
		const humid = window.humid;
		if (!provider || !humid?.on) return;

		const on = humid.on;
		const invalidate = () => {
			void queryClient.invalidateQueries({ queryKey: HUMID_SESSION_QUERY_KEY });
			void queryClient.invalidateQueries({ queryKey: HUMID_BALANCE_QUERY_KEY });
			void queryClient.invalidateQueries({ queryKey: HUMID_IDENTITY_QUERY_KEY });
		};

		const unsubscribers = WALLET_EVENTS.map((event) => on({ event, listener: invalidate }));

		return () => unsubscribers.forEach((unsubscribe) => unsubscribe?.());
	}, [provider, queryClient]);
}
