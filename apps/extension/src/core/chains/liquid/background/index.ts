import type { AccountRegistry } from "@/core/accounts/application/account-registry/AccountRegistry";
import type { AccountModelState } from "@/core/accounts/application/account-registry/model/account-model";
import type { ConfirmationResponder } from "@/core/extension-background/confirmations";

import type { LiquidChainGroup } from "../contract";
import { createLiquidAccounts } from "./liquidAccounts";
import { createLiquidDapps } from "./liquidDapps";
import { createLiquidPortfolio } from "./liquidPortfolio";
import { createLiquidWallet } from "./liquidWallet";
import { createLiquidWalletConnect } from "./liquidWalletConnect";

export function createLiquidBackground({
	chainGroup,
	confirm,
	getAccountModel,
	registry,
}: {
	chainGroup: LiquidChainGroup;
	confirm: ConfirmationResponder["confirm"];
	getAccountModel: () => AccountModelState | null;
	registry: AccountRegistry;
}) {
	const accounts = createLiquidAccounts(chainGroup, registry);
	const portfolio = createLiquidPortfolio(chainGroup, accounts);

	return {
		dapps: createLiquidDapps({ accounts, chainGroup, confirm, portfolio }),
		portfolio,
		wallet: createLiquidWallet(chainGroup, accounts),
		walletConnect: createLiquidWalletConnect(getAccountModel),
	};
}
