import type { Provenanced, ShownConfirmation } from "@humid/tx-manifest";

import {
	PROCESS_CT_CONFIRMATION_KIND,
	type ProcessCtConfirmationData,
} from "./ProcessCtConfirmation";

const brand = <T>(value: T, origin: Provenanced<T>["origin"]) =>
	({ origin, value }) as Provenanced<T>;
const computed = <T>(value: T) => brand(value, "computed");
const fromDapp = <T>(value: T) => brand(value, "dapp");
const verified = <T>(value: T) => brand(value, "verified");

const LBTC = "144c654344aa716d6f3abcc1ca90e5641e4e2a7f633bc09fe3baf64585819a49";
const RECEIPT = "3f9a8d6c2b1e4f7a9c0d5e3b8a6f1c2d4e7b9a0c3d5f8e1b2a4c6d9f0e3c21e";
const FACTORY = "5b7e2c9a4d1f8e3b6a0c7d2e9f4b1a8c5d3e7f0a2b9c6d4e1f8a3b5c7d0e9d913";
const FACTORY_ADDRESS = "tex1pz4hq7m3y2kxd5r9w8c6n0f4s2a7j3l1g5v9b8t6e4d2q0p8m3d";
const CONTRACT_ADDRESS = "tex1pq9w3e5r7t9y1u3i5o7p9a2s4d6f8g0h2j4k6l8z0x2c4v6b7xk2";

export const LENDING_SHOWN: ShownConfirmation = {
	account: computed("Account 0"),
	action: fromDapp("create_offer"),
	blindedAmounts: [],
	feeAsset: computed(LBTC),
	feeSats: computed("52"),
	inputs: [
		{
			address: verified(FACTORY_ADDRESS),
			asset: computed(FACTORY),
			kind: "program",
			name: verified("issuance_factory"),
			sats: computed("1"),
		},
		{ asset: computed(LBTC), kind: "wallet", sats: computed("1000000") },
		{ asset: computed(LBTC), kind: "wallet", sats: computed("734619") },
	],
	netEffect: [
		{ asset: computed(LBTC), sats: computed("-500052") },
		{ asset: computed(RECEIPT), sats: computed("1") },
	],
	outputs: [
		{
			address: computed(CONTRACT_ADDRESS),
			asset: computed(LBTC),
			kind: "program",
			name: computed("lending_contract"),
			sats: computed("500000"),
		},
		{
			address: verified(FACTORY_ADDRESS),
			asset: computed(FACTORY),
			kind: "program",
			name: computed("issuance_factory"),
			sats: computed("1"),
		},
		{ asset: computed(RECEIPT), kind: "wallet", sats: computed("1") },
		{
			asset: computed(LBTC),
			dataBytes: 50,
			kind: "data",
			name: fromDapp("offer_record"),
			sats: computed("0"),
		},
		{ asset: computed(LBTC), kind: "change", sats: computed("1234567") },
	],
	programs: [
		{
			address: verified(FACTORY_ADDRESS),
			cmr: computed("cc".repeat(32)),
			tapleafHash: computed("1e".repeat(32)),
			utxoType: fromDapp("issuance_factory"),
			verified: computed(true),
		},
		{
			address: computed(CONTRACT_ADDRESS),
			cmr: computed("dd".repeat(32)),
			tapleafHash: computed("2f".repeat(32)),
			utxoType: fromDapp("lending_contract"),
			verified: computed(false),
		},
	],
	protocol: fromDapp("lending"),
	publishedAmounts: [
		{
			id: computed("change"),
			reason: computed(
				"this wallet publishes a contract's change so the next action can spend those funds",
			),
		},
	],
	summary: fromDapp("Lend out 100 USDt against 0.005 L-BTC of collateral."),
};

const atFee = (feeSats: number): ShownConfirmation => ({
	...LENDING_SHOWN,
	feeSats: computed(String(feeSats)),
	netEffect: [
		{ asset: computed(LBTC), sats: computed(String(-(500_000 + feeSats))) },
		{ asset: computed(RECEIPT), sats: computed("1") },
	],
});

export const LENDING_OFFER: ProcessCtConfirmationData = {
	assets: { [LBTC]: { decimals: 8, ticker: "L-BTC" } },
	broadcast: true,
	kind: PROCESS_CT_CONFIRMATION_KIND,
	network: "Liquid Testnet",
	speeds: [
		{ shown: atFee(26), targetBlocks: 60 },
		{ shown: atFee(39), targetBlocks: 10 },
		{ shown: atFee(52), targetBlocks: 1 },
	],
};
