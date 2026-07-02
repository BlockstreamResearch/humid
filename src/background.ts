import { createAccountRegistry } from "@/core/accounts/application/account-registry";
import type { AccountModelState } from "@/core/accounts/application/account-registry/model/account-model";
import type {
	PortfolioSnapshot,
	ReceiveAddress,
} from "@/core/accounts/application/accounts-rpc/model/types";
import type { Caip25Scopes } from "@/core/caip25";
import { getUnlockedChainStoreState } from "@/core/chains/application/chain-store/secureChainStore";
import { resolveUnlockedLiquidChain } from "@/core/chains/liquid/chains/resolveLiquidChain";
import { createLiquidChainGroup } from "@/core/chains/liquid/createLiquidChainGroup";
import { parseLiquidChainId } from "@/core/chains/liquid/domain/validation";
import { createConfirmationResponder } from "@/core/extension-background/confirmations";
import {
	createDappAuthorization,
	type DappRequestDispatch,
	type SupportedDappScope,
} from "@/core/extension-background/dapp-authorization";
import { createInjectedRpcHandlers } from "@/core/extension-background/injected-rpc";
import {
	createInternalRpcHandlers,
	syncWalletVaultAuthStore,
} from "@/core/extension-background/internal-rpc";
import { createPortfolioSyncEngine } from "@/core/extension-background/portfolio-sync/createPortfolioSyncEngine";
import {
	registerBackgroundRpc,
	setupBackgroundTransport,
} from "@/core/extension-background/transport";
import { walletVaultBackground } from "@/core/secure-vault/application/wallet-vault/background";
import * as walletConnect from "@/core/walletconnect/background";
import { initNotificationManagement, updateBadgeOnStorageChange } from "@/helpers/background";
import { authStore } from "@/store/auth";

export type {
	PegasusEventProtocolMap,
	PegasusMsgProtocolMap,
} from "@/core/extension-background/transport";

function getAccountModel(): AccountModelState | null {
	try {
		return walletVaultBackground.keyManager.getState().accountModel;
	} catch {
		return null;
	}
}

async function updateAccountModel(
	update: (accountModel: AccountModelState) => AccountModelState,
): Promise<AccountModelState> {
	const state = await walletVaultBackground.keyManager.updateState((current) => ({
		...current,
		accountModel: update(current.accountModel),
	}));

	return state.accountModel;
}

const init = async () => {
	const messageBus = setupBackgroundTransport();

	await authStore.backendReady();

	syncWalletVaultAuthStore(await walletVaultBackground.initializeStorage());

	const confirmations = createConfirmationResponder(messageBus);
	const liquidChainGroup = createLiquidChainGroup();
	const accountRegistry = createAccountRegistry();

	// Liquid capability glue: keep the requested CAIP-25 scopes the Liquid chain
	// group can actually serve (valid chain ids + dispatcher methods).
	const resolveSupportedLiquidScope = (requested: Caip25Scopes): SupportedDappScope => {
		const supportedMethods = liquidChainGroup.walletRpcDispatcher.methods;
		const chains = new Set<string>();
		const methods = new Set<string>();

		for (const [scopeString, scopeObject] of Object.entries(requested)) {
			let chainId: string;

			try {
				chainId = parseLiquidChainId(scopeString);
			} catch {
				continue;
			}

			chains.add(chainId);

			for (const method of scopeObject.methods) {
				if (supportedMethods.includes(method)) methods.add(method);
			}
		}

		return { chains: [...chains], events: [], methods: [...methods] };
	};

	const dispatchInjectedLiquidRequest: DappRequestDispatch = async ({
		chainId,
		method,
		params,
	}) => {
		const liquidChainId = parseLiquidChainId(chainId);
		const chain = await resolveUnlockedLiquidChain(liquidChainId);

		return liquidChainGroup.walletRpcDispatcher.dispatch(
			{ method, params },
			{
				chain,
				confirm: confirmations.confirm,
				keyManagerState: walletVaultBackground.keyManager.getState(),
				updateKeyManagerState: walletVaultBackground.keyManager.updateState,
			},
		);
	};

	// Popup account runtime: resolve the selected Liquid chain + account into the input the
	// chain group's runtime facade needs (materialize + derive against it), plus the
	// identifiers that key the portfolio cache.
	const resolveSelectedLiquidAccount = async () => {
		const chainStore = await getUnlockedChainStoreState();
		const selectedChainId =
			chainStore.selectedChainIds[liquidChainGroup.id] ?? liquidChainGroup.chains[0].id;
		const chain = await resolveUnlockedLiquidChain(parseLiquidChainId(selectedChainId));
		const keyManagerState = walletVaultBackground.keyManager.getState();
		const selectedGroup = accountRegistry.getSelectedAccountGroup(keyManagerState.accountModel);
		const selectedWallet = keyManagerState.accountModel.wallets[selectedGroup.walletId];

		return {
			accountGroupId: selectedGroup.id,
			chainId: chain.id,
			input: {
				accountGroupIndex: selectedGroup.groupIndex ?? 0,
				chain,
				keySourceId: selectedWallet?.keySourceId,
				keyManagerState,
				updateKeyManagerState: walletVaultBackground.keyManager.updateState,
			},
		};
	};

	const getReceiveAddress = async (): Promise<ReceiveAddress> =>
		liquidChainGroup.accountRuntime.getReceiveAddress((await resolveSelectedLiquidAccount()).input);

	// Decouple portfolio reads from wallet scans: the popup polls `getPortfolio`, which
	// returns the cached balance instantly while the engine (re)syncs in the background.
	const portfolioSync = createPortfolioSyncEngine(async () => {
		const { accountGroupId, chainId, input } = await resolveSelectedLiquidAccount();

		return {
			key: `${accountGroupId}::${chainId}`,
			scan: () => liquidChainGroup.accountRuntime.getPortfolio(input),
		};
	});

	const getPortfolio = (): Promise<PortfolioSnapshot> => portfolioSync.getSnapshot();

	const dappAuthorization = createDappAuthorization({
		confirm: confirmations.confirm,
		dispatch: dispatchInjectedLiquidRequest,
		getAccountModel,
		registry: accountRegistry,
		resolveSupportedScope: resolveSupportedLiquidScope,
		updateAccountModel,
	});

	walletConnect.registerWalletConnectNamespaceAdapter(liquidChainGroup.walletConnectAdapter);

	await walletConnect.initializeWalletConnectBackground({
		confirm: confirmations.confirm,
	});

	registerBackgroundRpc(messageBus, {
		injected: createInjectedRpcHandlers({ authorization: dappAuthorization }),
		popup: createInternalRpcHandlers({
			chainGroups: [liquidChainGroup],
			confirmations,
			getPortfolio,
			getReceiveAddress,
		}),
	});

	updateBadgeOnStorageChange();
	initNotificationManagement();
};

void init();
