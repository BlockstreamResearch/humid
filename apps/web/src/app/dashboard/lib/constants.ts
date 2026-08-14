import { LIQUID_MAINNET_CHAIN_ID, LIQUID_TESTNET_CHAIN_ID } from "@humid/appkit-injected-adapter";

import { LIQUID_MAINNET, LIQUID_TESTNET } from "@/lib/liquid-networks";

// Chain-qualified for the wallet RPC, from the same asset the manifest inspector compares
// against. Written once: two spellings of one fact drift, and the wrong one refuses a document
// that should have built.
export const LIQUID_MAINNET_LBTC_ASSET_ID = `${LIQUID_MAINNET_CHAIN_ID}/elip144:${LIQUID_MAINNET.policyAsset}`;
export const LIQUID_TESTNET_LBTC_ASSET_ID = `${LIQUID_TESTNET_CHAIN_ID}/elip144:${LIQUID_TESTNET.policyAsset}`;

export const DEFAULT_IDENTITY = "ssh://humid@localhost";
export const DEFAULT_IDENTITY_CHALLENGE =
	"4c69717569642057616c6c6574205250432050726f66696c65206964656e74697479206368616c6c656e6765";
export const DEFAULT_KDF_INFO = "68756d69642d7765622d74657374";

/** The L-BTC policy asset id for a chain — the default asset for balance / UTXO / transfer cards. */
export function policyAssetIdForChain(chainId: string): string {
	if (chainId === LIQUID_MAINNET_CHAIN_ID) return LIQUID_MAINNET_LBTC_ASSET_ID;
	if (chainId === LIQUID_TESTNET_CHAIN_ID) return LIQUID_TESTNET_LBTC_ASSET_ID;

	return "";
}
