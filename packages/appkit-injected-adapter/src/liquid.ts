import {
	LIQUID_MAINNET_CHAIN_ID,
	LIQUID_MAINNET_CHAIN_REFERENCE,
	LIQUID_NAMESPACE,
	LIQUID_REGTEST_CHAIN_ID,
	LIQUID_REGTEST_CHAIN_REFERENCE,
	LIQUID_TESTNET_CHAIN_ID,
	LIQUID_TESTNET_CHAIN_REFERENCE,
	LIQUID_WALLET_RPC_METHODS,
} from "@humid/wallet-rpc";
import { defineChain } from "@reown/appkit/networks";

export const liquidWalletRpcMethods = Object.values(LIQUID_WALLET_RPC_METHODS);

export const liquid = defineChain({
	id: LIQUID_MAINNET_CHAIN_REFERENCE,
	caipNetworkId: LIQUID_MAINNET_CHAIN_ID,
	chainNamespace: LIQUID_NAMESPACE,
	name: "Liquid",
	nativeCurrency: { name: "Liquid Bitcoin", symbol: "L-BTC", decimals: 8 },
	rpcUrls: { default: { http: ["https://blockstream.info/liquid/api"] } },
});

export const liquidTestnet = defineChain({
	id: LIQUID_TESTNET_CHAIN_REFERENCE,
	caipNetworkId: LIQUID_TESTNET_CHAIN_ID,
	chainNamespace: LIQUID_NAMESPACE,
	name: "Liquid Testnet",
	nativeCurrency: { name: "Testnet Liquid Bitcoin", symbol: "tL-BTC", decimals: 8 },
	rpcUrls: { default: { http: ["https://blockstream.info/liquidtestnet/api"] } },
	testnet: true,
});

export const liquidRegtest = defineChain({
	id: LIQUID_REGTEST_CHAIN_REFERENCE,
	caipNetworkId: LIQUID_REGTEST_CHAIN_ID,
	chainNamespace: LIQUID_NAMESPACE,
	name: "Local regtest",
	nativeCurrency: { name: "Regtest Liquid Bitcoin", symbol: "L-BTC", decimals: 8 },
	rpcUrls: { default: { http: ["http://127.0.0.1:3000"] } },
	testnet: true,
});

export const liquidNetworks = [liquid, liquidTestnet, liquidRegtest] as [
	typeof liquid,
	typeof liquidTestnet,
	typeof liquidRegtest,
];
