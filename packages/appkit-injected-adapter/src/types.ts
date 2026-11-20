import type { Caip25GetSessionResult } from "@humid/wallet-rpc";
import type { CaipNetwork } from "@reown/appkit-common";
import type { Provider, RequestArguments } from "@reown/appkit-controllers";

/**
 * The minimal surface an injected wallet must expose on the page. `request` speaks the CAIP-25 /
 * CAIP-27 envelope; `on` is the optional EIP-1193-style event channel. Both the raw injected global
 * (e.g. `window.<wallet>`) and this package's bridged provider satisfy this type.
 */
export type RawInjectedProvider = {
	request: <T>(args: InjectedRequestArguments) => Promise<T>;
	on?: (args: { event: string; listener: (payload: unknown) => void }) => () => void;
};

export type InjectedRequestArguments = Omit<RequestArguments, "params"> & {
	chainId?: string;
	params?: unknown;
};

export type InjectedProvider = Omit<Provider, "request"> & {
	request: <T>(args: InjectedRequestArguments) => Promise<T>;
};

export type CaipRpcProvider = {
	request: <T>(args: { method: string; params?: unknown }) => Promise<T>;
};

export type SignMessageContext = {
	scope: string;
	/** The connected account's id, which AppKit passes as `address` when it signs on its own. */
	accountId: string | undefined;
	address: string;
	message: string;
	invoke: <T>(scope: string, method: string, params?: unknown) => Promise<T>;
};

export type ReadBalanceContext = {
	scope: string;
	session: Caip25GetSessionResult;
	invoke: <T>(scope: string, method: string, params?: unknown) => Promise<T>;
};

export type InjectedCaipAdapterOptions = {
	namespace: string;
	connector: {
		id: string;
		name: string;
		rdns: string;
	};
	getProvider: () => RawInjectedProvider | undefined;
	methods: readonly string[];
	notifications?: readonly string[];
	networks?: readonly CaipNetwork[];
	accountType?: string;
	signMessage?: (context: SignMessageContext) => Promise<{ signature: string }>;
	/** The native balance in base units, or undefined when reading it would prompt the user. */
	readBalance?: (context: ReadBalanceContext) => Promise<bigint | undefined>;
	providerTimeoutMs?: number;
};
