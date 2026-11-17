export const LIQUID_NAMESPACE = "bip122";

export const LIQUID_MAINNET_CHAIN_ID = "bip122:1466275836220db2944ca059a3a10ef6";
export const LIQUID_TESTNET_CHAIN_ID = "bip122:a771da8e52ee6ad581ed1e9a99825e5b";
export const LIQUID_REGTEST_CHAIN_ID = "bip122:00902a6b70c2ca83b5d9c815d96a0e2f";

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
