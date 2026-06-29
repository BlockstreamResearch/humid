import { createLwkWalletBackend } from "./adapters/lwk/createLwkWalletBackend";
import { createLiquidWalletConnectAdapter } from "./adapters/walletconnect/createLiquidWalletConnectAdapter";
import type { LiquidChain } from "./contract";

export function createLiquidChain(): LiquidChain {
	const walletBackend = createLwkWalletBackend();

	return {
		walletConnectAdapter: createLiquidWalletConnectAdapter({
			walletBackend,
		}),
	};
}
