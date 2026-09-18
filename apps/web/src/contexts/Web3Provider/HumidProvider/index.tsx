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
	hasProvider: boolean;

	isConnected: boolean;
	address: string;
	connect: () => Promise<void>;
	disconnect: () => Promise<void>;

	chainId: string;
	supportedChains: typeof liquidNetworks;
	switchNetwork: (chainId: string) => void;

	session: Caip25Scopes | null;
	policy: MethodPolicy;
	isSilent: (method: string) => boolean;
	createSession: () => Promise<void>;
	revokeSession: () => Promise<void>;
	refreshSession: () => void;

	identity: HumidIdentity | null;
	identityStatus: DataStatus;
	refreshIdentity: () => void;

	balance: bigint;
	balanceStatus: DataStatus;
	refreshBalance: () => void;

	wallet: WalletClient;
};

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

export const HumidProvider = ({ children }: PropsWithChildren) => {
	const { connectAsync } = useWeb3Context();
	const { disconnect } = useDisconnect();
	const { address, isConnected } = useAppKitAccount({ namespace: LIQUID_NAMESPACE });

	const provider = useHumidProvider();
	const [chainId, setChainId] = useState<string>(LIQUID_TESTNET_CHAIN_ID);

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
