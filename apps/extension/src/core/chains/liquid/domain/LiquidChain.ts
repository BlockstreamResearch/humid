import {
	LIQUID_MAINNET_CHAIN_ID,
	LIQUID_REGTEST_CHAIN_ID,
	LIQUID_TESTNET_CHAIN_ID,
} from "@humid/wallet-rpc";

export {
	LIQUID_MAINNET_CHAIN_ID,
	LIQUID_NAMESPACE,
	LIQUID_REGTEST_CHAIN_ID,
	LIQUID_TESTNET_CHAIN_ID,
} from "@humid/wallet-rpc";

export const LIQUID_CHAIN_IDS = [
	LIQUID_MAINNET_CHAIN_ID,
	LIQUID_TESTNET_CHAIN_ID,
	LIQUID_REGTEST_CHAIN_ID,
] as const;

export type BuiltInLiquidChainId = (typeof LIQUID_CHAIN_IDS)[number];
export type LiquidChainId = string;

export function isBuiltInLiquidChainId(chainId: LiquidChainId): chainId is BuiltInLiquidChainId {
	return (LIQUID_CHAIN_IDS as readonly LiquidChainId[]).includes(chainId);
}
