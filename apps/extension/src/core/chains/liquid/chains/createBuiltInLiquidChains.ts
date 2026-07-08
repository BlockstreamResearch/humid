import {
	type BuiltInLiquidChainId,
	LIQUID_MAINNET_CHAIN_ID,
	LIQUID_NAMESPACE,
	LIQUID_TESTNET_CHAIN_ID,
	type LiquidChainId,
} from "../domain/LiquidChain";
import {
	LIQUID_CHAIN_GROUP_ID,
	LIQUID_NETWORK_KINDS,
	type LiquidChainBackend,
	type LiquidChainRecord,
	type LiquidChainSettings,
	type LiquidNetworkKind,
} from "./LiquidChainRecord";

// Default blockchain backend per built-in chain. Testnet uses the public Waterfalls server (run by
// the LWK author): with `waterfalls: true` a whole-wallet scan is ONE server-side request, instead of
// the dozens of per-address history queries a plain esplora scan fans out — which tripped
// blockstream's free-tier rate limit (HTTP 429). Trade-off: waterfalls sends the descriptor to that
// server, which is fine for testnet dev but a privacy choice on mainnet — so mainnet stays on
// blockstream esplora for now (revisit with a Blockstream API key, a self-hosted node, or the
// encrypted-descriptor waterfalls mode).
const LIQUID_DEFAULT_BACKENDS = {
	[LIQUID_MAINNET_CHAIN_ID]: { url: "https://blockstream.info/liquid/api" },
	[LIQUID_TESTNET_CHAIN_ID]: {
		url: "https://waterfalls.liquidwebwallet.org/liquidtestnet/api",
		waterfalls: true,
	},
} satisfies Record<BuiltInLiquidChainId, LiquidChainBackend>;

const LIQUID_DEFAULT_EXPLORER_URLS = {
	[LIQUID_MAINNET_CHAIN_ID]: "https://blockstream.info/liquid/",
	[LIQUID_TESTNET_CHAIN_ID]: "https://blockstream.info/liquidtestnet/",
} as const satisfies Record<BuiltInLiquidChainId, string>;

const LIQUID_BUILT_IN_NETWORKS = {
	[LIQUID_MAINNET_CHAIN_ID]: LIQUID_NETWORK_KINDS.MAINNET,
	[LIQUID_TESTNET_CHAIN_ID]: LIQUID_NETWORK_KINDS.TESTNET,
} as const satisfies Record<BuiltInLiquidChainId, LiquidNetworkKind>;

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
	explorerUrl?: string;
	id: LiquidChainId;
	name: string;
	network?: LiquidNetworkKind;
	policyAsset?: string;
}): LiquidChainRecord {
	const explorerUrl =
		input.explorerUrl ?? LIQUID_DEFAULT_EXPLORER_URLS[input.id as BuiltInLiquidChainId];

	const settings: LiquidChainSettings = {
		network: input.network ?? createDefaultLiquidNetwork(input.id),
		backend: input.backend ?? createDefaultLiquidChainBackend(input.id),
		...(explorerUrl ? { explorerUrl } : {}),
		...(input.policyAsset ? { policyAsset: input.policyAsset } : {}),
	};

	return {
		chainGroupId: LIQUID_CHAIN_GROUP_ID,
		id: input.id,
		name: input.name,
		settings,
	};
}

function createDefaultLiquidNetwork(chainId: LiquidChainId): LiquidNetworkKind {
	return LIQUID_BUILT_IN_NETWORKS[chainId as BuiltInLiquidChainId] ?? LIQUID_NETWORK_KINDS.REGTEST;
}

function createDefaultLiquidChainBackend(chainId: LiquidChainId): LiquidChainBackend {
	const backend = LIQUID_DEFAULT_BACKENDS[chainId as BuiltInLiquidChainId];

	if (!backend) {
		throw new Error("Custom Liquid chains must provide backend settings.");
	}

	return { ...backend };
}

/** Create a fresh custom (regtest) Liquid chain with a generated id, for the add-chain form. */
export function createCustomLiquidChainRecord(name: string): LiquidChainRecord {
	return {
		chainGroupId: LIQUID_CHAIN_GROUP_ID,
		id: generateCustomLiquidChainId(),
		name,
		settings: {
			network: LIQUID_NETWORK_KINDS.REGTEST,
			backend: { url: "http://127.0.0.1:3000" },
		},
	};
}

// Custom chains can't derive a real genesis-based id (LWK's WASM Network fixes the
// regtest genesis), so mint a unique id in the CAIP-2 bip122 shape instead.
function generateCustomLiquidChainId(): LiquidChainId {
	const bytes = crypto.getRandomValues(new Uint8Array(16));
	const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

	return `${LIQUID_NAMESPACE}:${hex}`;
}
