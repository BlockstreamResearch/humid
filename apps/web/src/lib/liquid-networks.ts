import { LIQUID_MAINNET_CHAIN_ID, LIQUID_TESTNET_CHAIN_ID } from "@humid/appkit-injected-adapter";

/**
 * A Liquid network and the one asset this wallet moves on it.
 *
 * Two networks carry two different assets, and a protocol document naming `liquid` says which
 * family it is for rather than which network — so nothing in a document decides this, and
 * anything comparing an asset against "the network's own" has to be told which network first.
 */
export type LiquidNetwork = {
	chainId: string;
	name: string;
	/**
	 * The bare 32-byte hex asset id.
	 *
	 * This is the spelling a manifest uses and the one the wallet passes when it decides whether
	 * to build an action. The dapp's own cards want it chain-qualified for the wallet RPC, which
	 * is a longer spelling of the same fact and is built from this rather than written twice.
	 */
	policyAsset: string;
};

export const LIQUID_MAINNET: LiquidNetwork = {
	chainId: LIQUID_MAINNET_CHAIN_ID,
	name: "Liquid",
	policyAsset: "6f0279e9ed041c3d710a9f57d0c02928416460c4b722ae3457a11eec381c526d",
};

export const LIQUID_TESTNET: LiquidNetwork = {
	chainId: LIQUID_TESTNET_CHAIN_ID,
	name: "Liquid Testnet",
	policyAsset: "144c654344aa716d6f3abcc1ca90e5641e4e2a7f633bc09fe3baf64585819a49",
};

export const LIQUID_NETWORKS: readonly LiquidNetwork[] = [LIQUID_MAINNET, LIQUID_TESTNET];

/** The network with this chain id, or nothing — an unknown chain is not a network to default. */
export function liquidNetworkByChainId(chainId: string): LiquidNetwork | undefined {
	return LIQUID_NETWORKS.find((network) => network.chainId === chainId);
}
