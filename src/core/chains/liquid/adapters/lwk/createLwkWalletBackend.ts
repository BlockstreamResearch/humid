import type { LiquidWalletBackend } from "../../application/backends/LiquidWalletBackend";
import { getWalletBalanceForAsset } from "./wallet/getBalance";
import { getWalletUtxosForAsset } from "./wallet/getUTXOs";
import { getWalletDescriptorEntries } from "./wallet/getWalletDescriptor";
import { createLwkLiquidAccount } from "./wallet/resolveAccount";
import { inspectTransfer, sendTransfer } from "./wallet/sendTransfer";
import { inspectMessageSigning, signMessage } from "./wallet/signMessage";
import { signPset } from "./wallet/signPset";
import { scanAccount } from "./wallet/syncAccount";

export function createLwkWalletBackend(): LiquidWalletBackend {
	return {
		getBalance: getWalletBalanceForAsset,
		getDescriptorEntries: getWalletDescriptorEntries,
		getUtxos: getWalletUtxosForAsset,
		inspectMessageSigning,
		inspectTransfer,
		resolveAccount: createLwkLiquidAccount,
		sendTransfer,
		signMessage,
		signPset: signPset,
		syncAccount: scanAccount,
	};
}
