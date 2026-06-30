import {
	type BuiltInLiquidChainId,
	LIQUID_MAINNET_CHAIN_ID,
	LIQUID_TESTNET_CHAIN_ID,
	type LiquidChainId,
} from "../domain/LiquidChain";
import {
	LIQUID_CHAIN_BACKENDS,
	LIQUID_CHAIN_GROUP_ID,
	type LiquidChainBackend,
	type LiquidChainRecord,
} from "./LiquidChainRecord";

const LIQUID_DEFAULT_ESPLORA_URLS = {
	[LIQUID_MAINNET_CHAIN_ID]: "https://blockstream.info/liquid/api",
	[LIQUID_TESTNET_CHAIN_ID]: "https://blockstream.info/liquidtestnet/api",
} as const satisfies Record<BuiltInLiquidChainId, string>;

export function createBuiltInLiquidChains(): readonly LiquidChainRecord[] {
	return [
		createLiquidChainRecord({
			id: LIQUID_MAINNET_CHAIN_ID,
			name: "Liquid",
		}),
		createLiquidChainRecord({
			id: LIQUID_TESTNET_CHAIN_ID,
			name: "Liquid Testnet",
		}),
	];
}

export function createLiquidChainRecord(input: {
	backend?: LiquidChainBackend;
	id: LiquidChainId;
	name: string;
}): LiquidChainRecord {
	return {
		chainGroupId: LIQUID_CHAIN_GROUP_ID,
		id: input.id,
		name: input.name,
		settings: {
			backend: input.backend ?? createDefaultLiquidChainBackend(input.id),
		},
	};
}

function createDefaultLiquidChainBackend(chainId: LiquidChainId): LiquidChainBackend {
	const defaultUrl = LIQUID_DEFAULT_ESPLORA_URLS[chainId as BuiltInLiquidChainId];

	if (!defaultUrl) {
		throw new Error("Custom Liquid chains must provide backend settings.");
	}

	return {
		kind: LIQUID_CHAIN_BACKENDS.ESPLORA,
		url: defaultUrl,
	};
}
