import { WalletKit } from "@reown/walletkit";

import type { WalletConnectConfirmationHandler } from "../types";

export type WalletKitClient = Awaited<ReturnType<typeof WalletKit.init>>;

export type WalletConnectBackgroundOptions = {
	confirm?: WalletConnectConfirmationHandler;
};
