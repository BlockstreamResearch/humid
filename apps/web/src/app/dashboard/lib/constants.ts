import { LIQUID_MAINNET_CHAIN_ID, LIQUID_TESTNET_CHAIN_ID } from "@humid/appkit-injected-adapter";

export const LIQUID_MAINNET_LBTC_ASSET_ID = `${LIQUID_MAINNET_CHAIN_ID}/elip144:6f0279e9ed041c3d710a9f57d0c02928416460c4b722ae3457a11eec381c526d`;
export const LIQUID_TESTNET_LBTC_ASSET_ID = `${LIQUID_TESTNET_CHAIN_ID}/elip144:144c654344aa716d6f3abcc1ca90e5641e4e2a7f633bc09fe3baf64585819a49`;

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
