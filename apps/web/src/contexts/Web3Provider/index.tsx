import { HumidAdapter, liquidNetworks, liquidTestnet } from "@humid/appkit-injected-adapter";
import type { ChainNamespace } from "@reown/appkit-common";
import { createAppKit, useAppKit, useAppKitEvents, useDisconnect } from "@reown/appkit/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	createContext,
	useContext,
	useEffect,
	useRef,
	useState,
	type PropsWithChildren,
} from "react";

import { HumidProvider } from "./HumidProvider";

// Injected HUMID Liquid wallet in one call: the preset adapter carries every default (connector,
// window.humid, method set, ecdsa signMessage), and the networks come straight from the package.
createAppKit({
	adapters: [new HumidAdapter()],
	networks: liquidNetworks,
	defaultNetwork: liquidTestnet,
	projectId: "41f8085dc01ff1ca42c6efcb2c12c169",
	metadata: {
		name: "HUMID Liquid Dapp",
		description: "HUMID browser extension Liquid Wallet RPC test dapp",
		url: typeof window !== "undefined" ? window.location.origin : "",
		icons: [],
	},
	enableReconnect: true,
	features: {
		analytics: false,
		email: false,
		socials: false,
	},
	themeMode: "dark",
});

// A wallet decline surfaces as a JSON-RPC error carrying `data.reason === "user_rejected"` (code
// -32000, not the EVM 4001). It is a terminal decision, so react-query must NOT retry it — otherwise
// a single "Show balance" / "Reveal identity" click re-opens the confirmation prompt up to 3 more
// times (react-query's default `retry: 3`).
function isUserRejected(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"data" in error &&
		typeof (error as { data?: unknown }).data === "object" &&
		(error as { data?: { reason?: unknown } }).data?.reason === "user_rejected"
	);
}

// One QueryClient for the whole app; every HumidProvider hook (session / balance / identity) reads it.
// Retry transient failures (the library default of 3) but never a user rejection — see above.
const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			retry: (failureCount, error) => !isUserRejected(error) && failureCount < 3,
		},
	},
});

type Web3ContextValue = {
	isInitialized: boolean;
	connectAsync: (namespace: string) => Promise<void>;
};

const web3Context = createContext<Web3ContextValue>({
	isInitialized: false,
	connectAsync: async () => {
		throw new TypeError("Not implemented");
	},
});

export const useWeb3Context = () => useContext(web3Context);

/**
 * Promise-based wrapper over AppKit's imperative connect modal: opens the Connect view for a namespace
 * and resolves on CONNECT_SUCCESS, rejecting on CONNECT_ERROR or when the user closes the modal without
 * connecting. Lets callers `await connect()` instead of wiring up AppKit events themselves.
 */
const useConnectAsync = () => {
	const { open, close } = useAppKit();
	const { disconnect } = useDisconnect();
	const appKitEvent = useAppKitEvents();

	const [isConnecting, setIsConnecting] = useState(false);

	const resolveRef = useRef<() => void>(() => {});
	const rejectRef = useRef<(error?: Error) => void>(() => {});

	useEffect(() => {
		if (!isConnecting) return;

		if (appKitEvent?.data.event === "CONNECT_SUCCESS") {
			resolveRef.current();
			close();
			setIsConnecting(false);
			return;
		}

		if (appKitEvent?.data.event === "CONNECT_ERROR") {
			rejectRef.current(new Error("Failed to connect to the wallet"));
			close();
			setIsConnecting(false);
			return;
		}

		if (appKitEvent?.data.event === "MODAL_CLOSE") {
			if (!appKitEvent.data.properties.connected) {
				rejectRef.current(new Error("User closed the modal"));
				setIsConnecting(false);
				return;
			}

			resolveRef.current();
			close();
			setIsConnecting(false);
		}
	}, [appKitEvent, close, isConnecting]);

	return async (namespace: string) => {
		await disconnect({ namespace: namespace as ChainNamespace });

		setIsConnecting(true);

		return new Promise<void>((resolve, reject) => {
			open({ view: "Connect", namespace: namespace as ChainNamespace });
			resolveRef.current = resolve;
			rejectRef.current = reject;
		});
	};
};

/**
 * Top-level Web3 context: owns AppKit init gating and the promise-based connect, then hangs the
 * react-query client and the per-namespace HumidProvider beneath it. Renders nothing until AppKit has
 * initialized, so children never see a half-set-up AppKit.
 */
export const Web3Provider = ({ children }: PropsWithChildren) => {
	const [isInitialized, setIsInitialized] = useState(false);
	const appKitEvent = useAppKitEvents();
	const connectAsync = useConnectAsync();

	useEffect(() => {
		if (appKitEvent?.data.event === "INITIALIZE" || appKitEvent?.data.event === "CONNECT_SUCCESS") {
			setIsInitialized(true);
		}
	}, [appKitEvent]);

	if (!isInitialized) return null;

	return (
		<web3Context.Provider value={{ isInitialized, connectAsync }}>
			<QueryClientProvider client={queryClient}>
				<HumidProvider>{children}</HumidProvider>
			</QueryClientProvider>
		</web3Context.Provider>
	);
};
