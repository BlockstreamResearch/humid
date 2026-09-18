import {
	LIQUID_DESCRIPTOR_CHANGED_EVENT,
	type CaipRpcProvider,
} from "@humid/appkit-injected-adapter";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { HUMID_BALANCE_QUERY_KEY } from "./useHumidBalance";
import { HUMID_IDENTITY_QUERY_KEY } from "./useHumidIdentity";
import { HUMID_SESSION_QUERY_KEY } from "./useHumidSession";

const WALLET_EVENTS = [
	"accountsChanged",
	"chainChanged",
	LIQUID_DESCRIPTOR_CHANGED_EVENT,
	"wallet_sessionChanged",
] as const;

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
