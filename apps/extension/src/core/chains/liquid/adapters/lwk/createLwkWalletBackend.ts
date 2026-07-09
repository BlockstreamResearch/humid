import type { LiquidWalletBackend } from "../../application/backends/LiquidWalletBackend";
import { getWalletActivityForAsset } from "./wallet/getActivity";
import { getWalletBalanceForAsset } from "./wallet/getBalance";
import { getWalletReceiveAddress } from "./wallet/getReceiveAddress";
import { getWalletUtxosForAsset } from "./wallet/getUTXOs";
import { getWalletDescriptorEntries } from "./wallet/getWalletDescriptor";
import { createLwkLiquidAccount } from "./wallet/resolveAccount";
import { estimateMaxSend, inspectTransfer, sendTransfer } from "./wallet/sendTransfer";
import { inspectMessageSigning, signMessage } from "./wallet/signMessage";
import { signPset } from "./wallet/signPset";
import { scanAccount } from "./wallet/syncAccount";

export function createLwkWalletBackend(): LiquidWalletBackend {
	return {
		estimateMaxSend,
		getActivity: getWalletActivityForAsset,
		getBalance: getWalletBalanceForAsset,
		getReceiveAddress: getWalletReceiveAddress,
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
