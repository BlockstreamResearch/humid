import { WalletKit } from "@reown/walletkit";

import type {
	WalletConnectConfirmationHandler,
	WalletConnectReadPortfolioSnapshot,
} from "../types";

export type WalletKitClient = Awaited<ReturnType<typeof WalletKit.init>>;

export type WalletConnectBackgroundOptions = {
	confirm?: WalletConnectConfirmationHandler;
	readPortfolioSnapshot?: WalletConnectReadPortfolioSnapshot;
	/** Resolves once the wallet is unlocked or the unlock prompt is dismissed. */
	waitForUnlock?: () => Promise<void>;
};
