import { WalletKit } from "@reown/walletkit";

import type {
	WalletConnectConfirmationHandler,
	WalletConnectReadPortfolioSnapshot,
} from "../types";

export type WalletKitClient = Awaited<ReturnType<typeof WalletKit.init>>;

export type WalletConnectBackgroundOptions = {
	confirm?: WalletConnectConfirmationHandler;
	/** Serve-from-cache hook threaded to session-request handlers so WC reads use the snapshot. */
	readPortfolioSnapshot?: WalletConnectReadPortfolioSnapshot;
};
