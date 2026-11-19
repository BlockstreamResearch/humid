import makerPayoutSource from "@humid/tx-manifest/fixtures/dex/maker_payout.simf?raw";
import tesseraSource from "@humid/tx-manifest/fixtures/dex/tessera.simf?raw";
import dexManifest from "@humid/tx-manifest/fixtures/dex/txmanifest.json";
import lastWillSource from "@humid/tx-manifest/fixtures/last_will/last_will.simf?raw";
import lastWillManifest from "@humid/tx-manifest/fixtures/last_will/txmanifest.json";
import multiassetSource from "@humid/tx-manifest/fixtures/multiasset/p2pk.simf?raw";
import multiassetManifest from "@humid/tx-manifest/fixtures/multiasset/txmanifest.json";
import p2pkSource from "@humid/tx-manifest/fixtures/p2pk/p2pk.simf?raw";
import p2pkManifest from "@humid/tx-manifest/fixtures/p2pk/txmanifest.json";
import relaySource from "@humid/tx-manifest/fixtures/relay/relay.simf?raw";
import relayManifest from "@humid/tx-manifest/fixtures/relay/txmanifest.json";
import vaultSource from "@humid/tx-manifest/fixtures/relay/vault.simf?raw";

import { LIQUID_REGTEST_LBTC_ASSET_ID } from "@/app/dashboard/lib/constants";

import { Preset, type SentStep } from "./Preset";

const WILL_STEPS = ["Fund", "Refresh"];
const WILL = { utxoType: "last_will", vout: 0 };
const ISSUING_STEPS = ["MintReissuable", "Reissue"];
const OFFER = { utxoType: "tessera_offer", vout: 0 };
const RELAY = { utxoType: "relay", vout: 0 };
const LBTC = LIQUID_REGTEST_LBTC_ASSET_ID.split(":").at(-1)!;

const issuanceOf = (earlier?: SentStep) => {
	const issuance = earlier?.issuances?.[0];

	if (issuance === undefined) throw new Error(`${earlier?.action} returned no issuance.`);

	return issuance;
};

export const PRESETS = [
	new Preset(
		"p2pk",
		"Pay locks 1,000 sats to the wallet's key; Receive spends them back.",
		[
			{ action: "Pay", params: ({ key }) => ({ amount_sat: 1000, pubkey: key }) },
			{
				action: "Receive",
				after: ["Pay"],
				params: ({ key }) => ({ pubkey: key }),
				spends: { utxoType: "p2pk_output", vout: 0 },
			},
		],
		{ contractSources: { "./p2pk.simf": p2pkSource }, manifest: p2pkManifest },
	),
	new Preset(
		"last_will",
		"Fund locks 1,000 sats in a will held by the wallet's key, inheritable one block later.",
		[
			{
				action: "Fund",
				params: ({ key }) => ({
					COLD_PUB_KEY: key,
					HOT_PUB_KEY: key,
					INHERITOR_PUB_KEY: key,
					INHERIT_BLOCKS: "1",
					amount_sat: 1000,
				}),
			},
			{ action: "Refresh", after: WILL_STEPS, spends: WILL },
			{ action: "ColdBreak", after: WILL_STEPS, spends: WILL },
			{ action: "Inherit", after: WILL_STEPS, spends: WILL },
		],
		{ contractSources: { "./last_will.simf": lastWillSource }, manifest: lastWillManifest },
		"last_will_contract",
	),
	new Preset(
		"multiasset",
		"MintReissuable creates 21 units of a new asset and its reissuance token; Reissue mints 21 more " +
			"with the token; PayToken pays 5 units back to the wallet beside a 1,000-sat program output.",
		[
			{ action: "MintReissuable", params: () => ({ supply: 21 }) },
			{
				action: "Reissue",
				after: ISSUING_STEPS,
				params: (_account, earlier) => {
					const { entropy, issuedAsset, reissuanceToken } = issuanceOf(earlier);

					return { entropy, issued: issuedAsset, supply: 21, token: reissuanceToken };
				},
			},
			{
				action: "PayToken",
				after: ISSUING_STEPS,
				params: ({ key }, earlier) => ({
					amount_sat: 5,
					fee_sat: 1000,
					pubkey: key,
					token: issuanceOf(earlier).issuedAsset,
				}),
			},
		],
		{ contractSources: { "./p2pk.simf": multiassetSource }, manifest: multiassetManifest },
	),
	new Preset(
		"dex",
		"MakeOffer locks 5 units of the asset multiasset last minted in a keyless offer that pays " +
			"the wallet 1,500 sats; Settle fills the offer, ClaimPayout sweeps the maker's proceeds, " +
			"and Refund returns an unfilled offer, expired from block 1.",
		[
			{
				action: "MakeOffer",
				after: ISSUING_STEPS,
				from: "multiasset",
				params: ({ key }, earlier) => ({
					AMOUNT_B: 1500,
					ASSET_B: LBTC,
					MAKER_PUB_KEY: key,
					OFFER_AMOUNT: 5,
					OFFER_ASSET_ID: issuanceOf(earlier).issuedAsset,
					TIMEOUT: 1,
				}),
			},
			{ action: "Settle", after: ["MakeOffer"], spends: OFFER },
			{
				action: "ClaimPayout",
				after: ["Settle"],
				spends: { utxoType: "maker_payout", vout: 0 },
			},
			{ action: "Refund", after: ["MakeOffer"], spends: OFFER },
		],
		{
			contractSources: {
				"./maker_payout.simf": makerPayoutSource,
				"./tessera.simf": tesseraSource,
			},
			manifest: dexManifest,
		},
		"tessera_offer_contract",
	),
	new Preset(
		"relay",
		"RelayToAddress locks 1,000 sats in a keyless relay committed to the connected address's " +
			"script hash, and ReleaseToAddress pays them there. RelayToVault commits to a vault " +
			"held by the wallet's key instead, ReleaseToVault moves the coins into the vault, and " +
			"Withdraw signs them back.",
		[
			{ action: "RelayToAddress", params: ({ address }) => ({ amount_sat: 1000, payee: address }) },
			{
				action: "ReleaseToAddress",
				after: ["RelayToAddress"],
				params: ({ address }) => ({ payee: address }),
				spends: RELAY,
			},
			{ action: "RelayToVault", params: () => ({ amount_sat: 1000 }) },
			{ action: "ReleaseToVault", after: ["RelayToVault"], spends: RELAY },
			{
				action: "Withdraw",
				after: ["ReleaseToVault"],
				spends: { utxoType: "vault", vout: 0 },
			},
		],
		{
			contractSources: { "./relay.simf": relaySource, "./vault.simf": vaultSource },
			manifest: relayManifest,
		},
	),
];
