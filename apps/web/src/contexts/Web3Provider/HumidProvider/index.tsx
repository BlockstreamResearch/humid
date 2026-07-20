import {
	createSession as createCaipSession,
	createWalletClient,
	LIQUID_DESCRIPTOR_CHANGED_EVENT,
	LIQUID_NAMESPACE,
	LIQUID_TESTNET_CHAIN_ID,
	liquidNetworks,
	liquidWalletRpcMethods,
	revokeSession as revokeCaipSession,
	type Caip25Scopes,
	type CaipRpcProvider,
	type MethodPolicy,
	type WalletClient,
} from "@humid/appkit-injected-adapter";
import { useAppKitAccount, useDisconnect } from "@reown/appkit/react";
import {
	createContext,
	useContext,
	useEffect,
	useMemo,
	useState,
	type PropsWithChildren,
} from "react";

import { useWeb3Context } from "..";
import type { DataStatus } from "./status";
import { useHumidBalance } from "./useHumidBalance";
import { useHumidIdentity, type HumidIdentity } from "./useHumidIdentity";
import { useHumidSession } from "./useHumidSession";
import { useWalletEvents } from "./useWalletEvents";

type HumidContextValue = {
	// provider presence (window.humid detected yet)
	hasProvider: boolean;

	// reown
	isConnected: boolean;
	address: string;
	connect: () => Promise<void>;
	disconnect: () => Promise<void>;

	// network (dapp-side active scope)
	chainId: string;
	supportedChains: typeof liquidNetworks;
	switchNetwork: (chainId: string) => void;

	// session + policy
	session: Caip25Scopes | null;
	policy: MethodPolicy;
	isSilent: (method: string) => boolean;
	createSession: () => Promise<void>;
	revokeSession: () => Promise<void>;
	refreshSession: () => void;

	// identity personalization (identity-first)
	identity: HumidIdentity | null;
	identityStatus: DataStatus;
	refreshIdentity: () => void;

	// native L-BTC balance
	balance: bigint;
	balanceStatus: DataStatus;
	refreshBalance: () => void;

	// typed actions (bound to provider + active chainId)
	wallet: WalletClient;
};

/** A provider whose calls reject cleanly — used before window.humid exists so `wallet` is always defined. */
const NULL_PROVIDER: CaipRpcProvider = {
	request: () => Promise.reject(new Error("HUMID wallet provider was not found on the page.")),
};

const humidContext = createContext<HumidContextValue>({
	hasProvider: false,
	isConnected: false,
	address: "",
	connect: async () => {
		throw new TypeError("Not implemented");
	},
	disconnect: async () => {
		throw new TypeError("Not implemented");
	},

	chainId: LIQUID_TESTNET_CHAIN_ID,
	supportedChains: liquidNetworks,
	switchNetwork: () => {},

	session: null,
	policy: {},
	isSilent: () => false,
	createSession: async () => {
		throw new TypeError("Not implemented");
	},
	revokeSession: async () => {
		throw new TypeError("Not implemented");
	},
	refreshSession: () => {},

	identity: null,
	identityStatus: "idle",
	refreshIdentity: () => {},

	balance: 0n,
	balanceStatus: "idle",
	refreshBalance: () => {},

	wallet: createWalletClient(NULL_PROVIDER, LIQUID_TESTNET_CHAIN_ID),
});

export const useHumidContext = () => useContext(humidContext);

/** All Liquid networks authorized with the full method surface — the scopes passed to createSession. */
function buildAllScopes(): Caip25Scopes {
	return Object.fromEntries(
		liquidNetworks.map((network) => [
			network.caipNetworkId,
			{
				methods: [...liquidWalletRpcMethods],
				notifications: [LIQUID_DESCRIPTOR_CHANGED_EVENT],
			},
		]),
	);
}

/** The injected provider appears a tick after load; retry briefly so the UI recovers on its own. */
function useHumidProvider(): CaipRpcProvider | null {
	const [provider, setProvider] = useState<CaipRpcProvider | null>(
		() => (window.humid as CaipRpcProvider | undefined) ?? null,
	);

	useEffect(() => {
		if (provider) return;

		let tries = 0;
		const interval = setInterval(() => {
			tries += 1;
			const found = window.humid as CaipRpcProvider | undefined;
			if (found) {
				setProvider(found);
				clearInterval(interval);
			} else if (tries > 12) {
				clearInterval(interval);
			}
		}, 300);

		return () => clearInterval(interval);
	}, [provider]);

	return provider;
}

/**
 * Per-namespace (bip122) sub-context: bridges reown/AppKit connection state, the dapp-side active
 * chain, the CAIP-25 session + method policy, and the policy-aware balance / identity reads into one
 * value. The typed `wallet` client is bound to the live provider and active chain; the composed hooks
 * own the react-query data, this provider just wires them together and exposes the actions.
 */
export const HumidProvider = ({ children }: PropsWithChildren) => {
	const { connectAsync } = useWeb3Context();
	const { disconnect } = useDisconnect();
	const { address, isConnected } = useAppKitAccount({ namespace: LIQUID_NAMESPACE });

	const provider = useHumidProvider();
	const [chainId, setChainId] = useState<string>(LIQUID_TESTNET_CHAIN_ID);

	// The client is always defined: a null provider rejects cleanly until window.humid is present.
	const wallet = useMemo(
		() => createWalletClient(provider ?? NULL_PROVIDER, chainId),
		[provider, chainId],
	);

	const { session, policy, refresh: refreshSession } = useHumidSession(provider, chainId);
	const isSilent = (method: string) => policy[method] === true;

	const {
		balance,
		status: balanceStatus,
		refresh: refreshBalance,
	} = useHumidBalance({ wallet, chainId, isConnected, silent: isSilent("getBalance") });

	const {
		identity,
		status: identityStatus,
		refresh: refreshIdentity,
	} = useHumidIdentity({
		wallet,
		chainId,
		isConnected,
		silent: isSilent("getIdentityPublicKey"),
	});

	// Re-read session / balance / identity reactively on any wallet-side change, not just on poll.
	useWalletEvents(provider);

	const value: HumidContextValue = {
		hasProvider: provider !== null,
		isConnected,
		address: address ?? "",
		connect: async () => {
			await connectAsync(LIQUID_NAMESPACE);
		},
		disconnect: async () => {
			await disconnect({ namespace: LIQUID_NAMESPACE });
		},

		chainId,
		supportedChains: liquidNetworks,
		switchNetwork: setChainId,

		session,
		policy,
		isSilent,
		createSession: async () => {
			if (!provider) throw new Error("HUMID wallet provider was not found on the page.");
			await createCaipSession(provider, buildAllScopes());
			refreshSession();
		},
		revokeSession: async () => {
			if (!provider) return;
			await revokeCaipSession(provider);
			refreshSession();
		},
		refreshSession,

		identity,
		identityStatus,
		refreshIdentity,

		balance,
		balanceStatus,
		refreshBalance,

		wallet,
	};

	return <humidContext.Provider value={value}>{children}</humidContext.Provider>;
};
