import type { CaipAddress, CaipNetwork, ChainNamespace, Hex } from "@reown/appkit-common";
import {
	AdapterBlueprint,
	CoreHelperUtil,
	WalletConnectConnector,
	type ChainAdapterConnector,
} from "@reown/appkit-controllers";
import type UniversalProvider from "@walletconnect/universal-provider";

import { createInjectedProvider } from "./provider";
import { createSession, getSession, invokeMethod, revokeSession } from "./rpc";
import type { Caip25Scopes, InjectedCaipAdapterOptions, InjectedProvider } from "./types";

const DEFAULT_ACCOUNT_TYPE = "payment";

/**
 * An AppKit AdapterBlueprint for an injected wallet that authorizes via CAIP-25 and invokes methods
 * via CAIP-27. Everything wallet / chain / brand-specific is supplied through
 * {@link InjectedCaipAdapterOptions}, so the same class serves any such wallet.
 */
export class InjectedCaipAdapter extends AdapterBlueprint<ChainAdapterConnector> {
	private readonly options: InjectedCaipAdapterOptions;
	private readonly injectedProvider: InjectedProvider;

	constructor(options: InjectedCaipAdapterOptions) {
		// AppKit matches a passed adapter to a chain namespace by `adapter.namespace` (see
		// createAdapters) BEFORE calling construct(). Without it, the namespace slot falls back to a
		// WalletConnect-only UniversalAdapter and this adapter's syncConnectors never runs — so the
		// injected connector never shows in the connect modal. Set the namespace up front.
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

		// Opens the wallet's connect approval modal; the result advertises the granted account ids per
		// chain, so no follow-up read is needed.
		const { sessionScopes } = await createSession(this.injectedProvider, this.buildSessionScopes());
		const accountIdentifier = sessionScopes[network.caipNetworkId]?.accounts?.[0];

		if (!accountIdentifier) {
			throw new Error(`${this.options.connector.name} returned no account for this chain.`);
		}

		const account = parseCaipAccountId(accountIdentifier);

		// Hand AppKit a ParsedCaipAddress OBJECT (not a string): getAccount keeps the chainId, so
		// setCaipAddress gets a valid `<namespace>:<ref>:<address>`. `network.id` is the bare chain ref.
		this.onConnect(
			[
				{
					address: account.address,
					chainId: network.id,
					chainNamespace: this.options.namespace as ChainNamespace,
				},
			],
			this.options.connector.id,
		);

		return {
			id: this.options.connector.id,
			type: "INJECTED" as const,
			provider: this.injectedProvider,
			chainId: network.id,
			address: account.address,
			accounts: [] as [],
		};
	}

	async disconnect(params?: AdapterBlueprint.DisconnectParams) {
		if (!params?.id || params.id === this.options.connector.id) {
			try {
				await revokeSession(this.injectedProvider);
			} catch {
				// Best-effort: clear local connection state even if the wallet is unreachable.
			}

			this.onDisconnect(this.options.connector.id);
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

	async getBalance(params: AdapterBlueprint.GetBalanceParams) {
		return {
			balance: "0.00",
			symbol: params.caipNetwork?.nativeCurrency.symbol ?? "",
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

		// Restore ONLY from an existing session (read-only getSession, no approval prompt). Throwing
		// when there's nothing to restore makes AppKit clear the connector id it restored from storage;
		// otherwise a later manual connect can't change activeConnectorIds and the modal hangs.
		const { sessionScopes } = await getSession(this.injectedProvider);
		const accountIdentifier = sessionScopes[network.caipNetworkId]?.accounts?.[0];

		if (!accountIdentifier) {
			throw new Error("No existing session to restore.");
		}

		const account = parseCaipAccountId(accountIdentifier);

		this.onConnect(
			[
				{
					address: account.address,
					chainId: network.id,
					chainNamespace: this.options.namespace as ChainNamespace,
				},
			],
			this.options.connector.id,
		);

		return {
			id: this.options.connector.id,
			type: "INJECTED" as const,
			provider: this.injectedProvider,
			chainId: network.id,
			address: account.address,
			accounts: [] as [],
		};
	}

	async signMessage(params: AdapterBlueprint.SignMessageParams) {
		const caipNetwork = this.getConnection({
			connectors: this.connectors,
			connections: this.connections,
			connectorId: this.options.connector.id,
		})?.caipNetwork;

		if (!caipNetwork) throw new Error(`${this.options.connector.name} connection is missing`);

		const scope = caipNetwork.caipNetworkId;
		const invoke = <T>(target: string, method: string, methodParams?: unknown): Promise<T> =>
			invokeMethod<T>(this.injectedProvider, target, method, methodParams);

		if (this.options.signMessage) {
			return this.options.signMessage({
				scope,
				address: params.address,
				message: params.message,
				invoke,
			});
		}

		const result = await invoke<{ signature: string } | string>(scope, "signMessage", {
			address: params.address,
			message: params.message,
		});

		return { signature: typeof result === "string" ? result : result.signature };
	}

	async estimateGas() {
		return { gas: 0n };
	}

	async sendTransaction() {
		return { hash: "" };
	}

	async writeContract() {
		return { hash: "" };
	}

	async writeSolanaTransaction() {
		return { hash: "" };
	}

	parseUnits(params: AdapterBlueprint.ParseUnitsParams) {
		return BigInt(params.value);
	}

	formatUnits(params: AdapterBlueprint.FormatUnitsParams) {
		return params.value.toString();
	}

	getWalletConnectProvider(params: AdapterBlueprint.GetWalletConnectProviderParams) {
		return params.provider;
	}

	async getCapabilities() {
		return {
			methods: [...this.options.methods],
		};
	}

	async grantPermissions() {
		return {};
	}

	async revokePermissions(): Promise<Hex> {
		return "0x";
	}

	async walletGetAssets() {
		return {};
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

	/**
	 * The networks this adapter serves. Prefer the explicitly-configured `options.networks` so the
	 * adapter never depends on AppKit having them registered in its ChainController — that registration
	 * can be empty for a custom namespace at connect time (namespace derivation, approved-network
	 * filtering, reconnect state). Falls back to AppKit's networks when no list is configured.
	 */
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

function parseCaipAccountId(accountIdentifier: string): { address: string; scope: string } {
	const separator = accountIdentifier.lastIndexOf(":");

	if (separator <= 0) {
		throw new Error(`Invalid CAIP account identifier: ${accountIdentifier}`);
	}

	return {
		address: accountIdentifier.slice(separator + 1),
		scope: accountIdentifier.slice(0, separator),
	};
}

function toCaipAddress(network: CaipNetwork | undefined, address: string): CaipAddress {
	if (!network) throw new Error("Cannot build CAIP address without network");

	return `${network.caipNetworkId}:${address}` as CaipAddress;
}
