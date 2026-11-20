import type { Caip25Scopes } from "@humid/wallet-rpc";
import type { CaipAddress, CaipNetwork, ChainNamespace, Hex } from "@reown/appkit-common";
import {
	AdapterBlueprint,
	CoreHelperUtil,
	WalletConnectConnector,
	type ChainAdapterConnector,
} from "@reown/appkit-controllers";
import type UniversalProvider from "@walletconnect/universal-provider";

import { createInjectedProvider, waitForProvider } from "./provider";
import {
	addChain as addChainRpc,
	type AddChainParams,
	createSession,
	getSession,
	invokeMethod,
	revokeSession,
	switchChain as switchChainRpc,
} from "./rpc";
import type { InjectedCaipAdapterOptions, InjectedProvider, RawInjectedProvider } from "./types";

const DEFAULT_ACCOUNT_TYPE = "payment";

const WALLET_BRIDGE_EVENTS = [
	"accountsChanged",
	"chainChanged",
	"wallet_sessionChanged",
	"disconnect",
] as const;

export class InjectedCaipAdapter extends AdapterBlueprint<ChainAdapterConnector> {
	private readonly options: InjectedCaipAdapterOptions;
	private readonly injectedProvider: InjectedProvider;

	private walletEventUnsubscribers: Array<() => void> = [];
	private lastEmittedAccountId: string | undefined;
	private lastEmittedChainId: string | undefined;

	private readonly invoke = <T>(scope: string, method: string, params?: unknown): Promise<T> =>
		invokeMethod<T>(this.injectedProvider, scope, method, params);

	constructor(options: InjectedCaipAdapterOptions) {
		super({ namespace: options.namespace as ChainNamespace });

		this.options = options;
		this.injectedProvider = createInjectedProvider(options.getProvider, {
			connectorId: options.connector.id,
			timeoutMs: options.providerTimeoutMs,
		});
	}

	async setUniversalProvider(universalProvider: UniversalProvider) {
		if (!this.namespace) {
			throw new Error("InjectedCaipAdapter:setUniversalProvider - namespace is required");
		}

		this.addConnector(
			new WalletConnectConnector({
				provider: universalProvider,
				caipNetworks: this.getCaipNetworks(this.namespace),
				namespace: this.namespace,
			}),
		);
	}

	async connect(params: AdapterBlueprint.ConnectParams) {
		if (params.id !== this.options.connector.id) {
			throw new Error(`Unsupported connector: ${params.id}`);
		}

		const network = this.resolveNetwork(params.chainId);

		const { sessionScopes } = await createSession(this.injectedProvider, this.buildSessionScopes());

		return this.adoptSession(
			network,
			sessionScopes,
			`${this.options.connector.name} returned no account for this chain.`,
		);
	}

	async disconnect(params?: AdapterBlueprint.DisconnectParams) {
		if (!params?.id || params.id === this.options.connector.id) {
			try {
				await revokeSession(this.injectedProvider);
			} catch {}

			this.onDisconnect(this.options.connector.id);
			this.unsubscribeFromWalletEvents();
			this.lastEmittedAccountId = undefined;
			this.lastEmittedChainId = undefined;
		}

		return { connections: this.connections };
	}

	async getAccounts() {
		return {
			accounts: this.connections.flatMap((connection) =>
				connection.accounts.map((account) => {
					const caipAddress =
						account.caipAddress ?? toCaipAddress(connection.caipNetwork, account.address);

					return CoreHelperUtil.createAccount<ChainNamespace>({
						caipAddress,
						type: this.options.accountType ?? DEFAULT_ACCOUNT_TYPE,
						publicKey: account.publicKey,
					});
				}),
			),
		};
	}

	// AppKit renders any non-numeric balance as zero and an absent one as loading forever.
	async getBalance({ caipNetwork }: AdapterBlueprint.GetBalanceParams) {
		const symbol = caipNetwork?.nativeCurrency.symbol ?? "";
		const readBalance = this.options.readBalance;

		if (!caipNetwork || !readBalance) return { balance: "0", symbol };

		const units = await getSession(this.injectedProvider)
			.then((session) =>
				readBalance({ invoke: this.invoke, scope: caipNetwork.caipNetworkId, session }),
			)
			.catch(() => undefined);
		const { decimals } = caipNetwork.nativeCurrency;

		return {
			balance: units === undefined ? "0" : this.formatUnits({ decimals, value: units }),
			symbol,
		};
	}

	async syncConnectors() {
		this.addConnector({
			id: this.options.connector.id,
			type: "INJECTED",
			name: this.options.connector.name,
			provider: this.injectedProvider,
			chain: this.options.namespace as ChainNamespace,
			chains: this.getCaipNetworks(this.namespace),
			info: {
				name: this.options.connector.name,
				rdns: this.options.connector.rdns,
				uuid: this.options.connector.id,
			},
		});
	}

	syncConnections() {
		return Promise.resolve();
	}

	async syncConnection(params: AdapterBlueprint.SyncConnectionParams) {
		const network = this.resolveNetwork(params.chainId);

		const { sessionScopes } = await getSession(this.injectedProvider);

		return this.adoptSession(network, sessionScopes, "No existing session to restore.");
	}

	async signMessage(params: AdapterBlueprint.SignMessageParams) {
		const caipNetwork = this.getConnection({
			connectors: this.connectors,
			connections: this.connections,
			connectorId: this.options.connector.id,
		})?.caipNetwork;

		if (!caipNetwork) throw new Error(`${this.options.connector.name} connection is missing`);

		const scope = caipNetwork.caipNetworkId;

		if (this.options.signMessage) {
			return this.options.signMessage({
				scope,
				accountId: this.lastEmittedAccountId,
				address: params.address,
				message: params.message,
				invoke: this.invoke,
			});
		}

		const result = await this.invoke<{ signature: string } | string>(scope, "signMessage", {
			address: params.address,
			message: params.message,
		});

		return { signature: typeof result === "string" ? result : result.signature };
	}

	async estimateGas(): Promise<never> {
		throw this.unsupported("estimateGas");
	}

	async sendTransaction(): Promise<never> {
		throw this.unsupported("sendTransaction");
	}

	async writeContract(): Promise<never> {
		throw this.unsupported("writeContract");
	}

	async writeSolanaTransaction(): Promise<never> {
		throw this.unsupported("writeSolanaTransaction");
	}

	parseUnits({ decimals, value }: AdapterBlueprint.ParseUnitsParams) {
		const [whole = "", fraction = "", extra] = value.trim().split(".");

		if (
			extra !== undefined ||
			!/^\d*$/.test(whole + fraction) ||
			whole + fraction === "" ||
			fraction.length > decimals
		) {
			throw new Error(`${value} is not an amount with at most ${decimals} decimals.`);
		}

		return BigInt(whole + fraction.padEnd(decimals, "0"));
	}

	formatUnits({ decimals, value }: AdapterBlueprint.FormatUnitsParams) {
		const digits = (value < 0n ? -value : value).toString().padStart(decimals + 1, "0");
		const whole = digits.slice(0, digits.length - decimals);
		const fraction = digits.slice(digits.length - decimals).replace(/0+$/, "");

		return `${value < 0n ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
	}

	getWalletConnectProvider(params: AdapterBlueprint.GetWalletConnectProviderParams) {
		return params.provider;
	}

	async getCapabilities() {
		return {
			methods: [...this.options.methods],
		};
	}

	async addChain(params: AddChainParams): Promise<{ chainId: string }> {
		return addChainRpc(this.injectedProvider, params);
	}

	async switchChain(chainId: string): Promise<{ chainId: string }> {
		return switchChainRpc(this.injectedProvider, chainId);
	}

	async grantPermissions(): Promise<never> {
		throw this.unsupported("grantPermissions");
	}

	async revokePermissions(): Promise<Hex> {
		throw this.unsupported("revokePermissions");
	}

	async walletGetAssets() {
		return {};
	}

	private async adoptSession(network: CaipNetwork, sessionScopes: Caip25Scopes, noAccount: string) {
		const accountIdentifier = sessionScopes[network.caipNetworkId]?.accounts?.[0];

		if (!accountIdentifier) throw new Error(noAccount);

		const { id } = parseCaipAccountId(accountIdentifier);

		this.onConnect(
			[
				{
					address: id,
					chainId: network.id,
					chainNamespace: this.options.namespace as ChainNamespace,
				},
			],
			this.options.connector.id,
		);

		await this.subscribeToWalletEvents({ accountId: id, chainId: network.id });

		return {
			id: this.options.connector.id,
			type: "INJECTED" as const,
			provider: this.injectedProvider,
			chainId: network.id,
			address: id,
			accounts: [] as [],
		};
	}

	private unsupported(method: string): Error {
		return new Error(
			`${this.options.connector.name} does not support AppKit's ${method}. ` +
				"Invoke the wallet's own methods through the provider instead.",
		);
	}

	private async subscribeToWalletEvents(seed?: { accountId: string; chainId: string | number }) {
		if (seed) {
			this.lastEmittedAccountId = seed.accountId;
			this.lastEmittedChainId = seed.chainId.toString();
		}

		this.unsubscribeFromWalletEvents();

		let raw: RawInjectedProvider;
		try {
			raw = await waitForProvider(this.options.getProvider, this.options.providerTimeoutMs);
		} catch {
			return; // Provider not on the page; nothing to bridge (a later connect re-subscribes).
		}

		const subscribe = raw.on;
		if (!subscribe) return; // Wallet exposes no event channel.

		for (const eventName of WALLET_BRIDGE_EVENTS) {
			const unsubscribe = subscribe({
				event: eventName,
				listener: (payload) => {
					void this.handleWalletEvent(payload);
				},
			});

			if (unsubscribe) this.walletEventUnsubscribers.push(unsubscribe);
		}
	}

	private unsubscribeFromWalletEvents() {
		for (const unsubscribe of this.walletEventUnsubscribers) {
			try {
				unsubscribe();
			} catch {}
		}

		this.walletEventUnsubscribers = [];
	}

	private async handleWalletEvent(payload: unknown) {
		let sessionScopes: Caip25Scopes;
		try {
			({ sessionScopes } = await getSession(this.injectedProvider));
		} catch {
			return; // Transient read failure: keep the current view rather than flapping.
		}

		const network = this.resolveNetworkForEvent(payload);
		const accountIdentifier = sessionScopes[network.caipNetworkId]?.accounts?.[0];

		if (!accountIdentifier) {
			if (this.lastEmittedAccountId !== undefined) {
				this.lastEmittedAccountId = undefined;
				this.lastEmittedChainId = undefined;
				this.onDisconnect(this.options.connector.id);
			}

			return;
		}

		const { id: accountId } = parseCaipAccountId(accountIdentifier);
		const nextChainId = network.id.toString();
		const chainChanged =
			this.lastEmittedChainId !== undefined && nextChainId !== this.lastEmittedChainId;
		const accountChanged = accountId !== this.lastEmittedAccountId;

		if (!chainChanged && !accountChanged) return; // Nothing AppKit doesn't already know.

		this.lastEmittedAccountId = accountId;
		this.lastEmittedChainId = nextChainId;

		if (chainChanged) {
			this.emit("switchNetwork", { chainId: network.id });
		}

		this.onConnect(
			[
				{
					address: accountId,
					chainId: network.id,
					chainNamespace: this.options.namespace as ChainNamespace,
				},
			],
			this.options.connector.id,
		);
	}

	private resolveNetworkForEvent(payload: unknown): CaipNetwork {
		const eventChainId = extractEventChainId(payload);

		if (eventChainId) {
			const reference = eventChainId.includes(":")
				? eventChainId.slice(eventChainId.lastIndexOf(":") + 1)
				: eventChainId;
			const match = this.resolveNetworks().find(
				(network) =>
					network.caipNetworkId === eventChainId ||
					network.id.toString() === eventChainId ||
					network.id.toString() === reference,
			);

			if (match) return match;
		}

		const activeNetwork = this.getConnection({
			connectors: this.connectors,
			connections: this.connections,
			connectorId: this.options.connector.id,
		})?.caipNetwork;

		return activeNetwork ?? this.resolveNetwork(this.lastEmittedChainId);
	}

	private buildSessionScopes(): Caip25Scopes {
		const notifications = [...(this.options.notifications ?? [])];

		return Object.fromEntries(
			this.resolveNetworks().map((network) => [
				network.caipNetworkId,
				{
					methods: [...this.options.methods],
					notifications,
				},
			]),
		);
	}

	private resolveNetworks(): readonly CaipNetwork[] {
		return this.options.networks ?? this.getCaipNetworks(this.namespace);
	}

	private resolveNetwork(chainId: number | string | undefined): CaipNetwork {
		const networks = this.resolveNetworks();
		const network =
			networks.find((item) => item.id.toString() === chainId?.toString()) ?? networks[0];

		if (!network) throw new Error(`No ${this.options.namespace} network configured`);

		return network;
	}
}

function extractEventChainId(payload: unknown): string | undefined {
	if (typeof payload === "string") return payload;

	if (payload && typeof payload === "object" && "chainId" in payload) {
		const { chainId } = payload as { chainId?: unknown };
		if (typeof chainId === "string") return chainId;
		if (typeof chainId === "number") return chainId.toString();
	}

	return undefined;
}

// AppKit calls an account's id its "address"; for Liquid the id names a descriptor wallet, not an address.
function parseCaipAccountId(accountIdentifier: string): { id: string; scope: string } {
	const separator = accountIdentifier.lastIndexOf(":");

	if (separator <= 0) {
		throw new Error(`Invalid CAIP account identifier: ${accountIdentifier}`);
	}

	return {
		id: accountIdentifier.slice(separator + 1),
		scope: accountIdentifier.slice(0, separator),
	};
}

function toCaipAddress(network: CaipNetwork | undefined, accountId: string): CaipAddress {
	if (!network) throw new Error("Cannot build CAIP address without network");

	return `${network.caipNetworkId}:${accountId}` as CaipAddress;
}
