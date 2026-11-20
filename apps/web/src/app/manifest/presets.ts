import makerPayoutSource from "@humid/tx-manifest/fixtures/dex/maker_payout.simf?raw";
import tesseraSource from "@humid/tx-manifest/fixtures/dex/tessera.simf?raw";
import dexManifest from "@humid/tx-manifest/fixtures/dex/txmanifest.json";
import lastWillSource from "@humid/tx-manifest/fixtures/last_will/last_will.simf?raw";
import lastWillManifest from "@humid/tx-manifest/fixtures/last_will/txmanifest.json";
import lendingV2AssetAuth from "@humid/tx-manifest/fixtures/lending_v2/asset_auth.simf?raw";
import lendingV2Lending from "@humid/tx-manifest/fixtures/lending_v2/lending.simf?raw";
import lendingV2PreLock from "@humid/tx-manifest/fixtures/lending_v2/pre_lock.simf?raw";
import lendingV2ScriptAuth from "@humid/tx-manifest/fixtures/lending_v2/script_auth.simf?raw";
import lendingV2Manifest from "@humid/tx-manifest/fixtures/lending_v2/txmanifest.json";
import lendingV3AssetAuth from "@humid/tx-manifest/fixtures/lending_v3/asset_auth.simf?raw";
import lendingV3AssetAuthVault from "@humid/tx-manifest/fixtures/lending_v3/asset_auth_vault.simf?raw";
import lendingV3Factory from "@humid/tx-manifest/fixtures/lending_v3/issuance_factory.simf?raw";
import lendingV3Lending from "@humid/tx-manifest/fixtures/lending_v3/lending.simf?raw";
import lendingV3ScriptAuth from "@humid/tx-manifest/fixtures/lending_v3/script_auth.simf?raw";
import lendingV3Manifest from "@humid/tx-manifest/fixtures/lending_v3/txmanifest.json";
import multiassetSource from "@humid/tx-manifest/fixtures/multiasset/p2pk.simf?raw";
import multiassetManifest from "@humid/tx-manifest/fixtures/multiasset/txmanifest.json";
import p2pkSource from "@humid/tx-manifest/fixtures/p2pk/p2pk.simf?raw";
import p2pkManifest from "@humid/tx-manifest/fixtures/p2pk/txmanifest.json";
import relaySource from "@humid/tx-manifest/fixtures/relay/relay.simf?raw";
import relayManifest from "@humid/tx-manifest/fixtures/relay/txmanifest.json";
import vaultSource from "@humid/tx-manifest/fixtures/relay/vault.simf?raw";

import { LIQUID_REGTEST_LBTC_ASSET_ID } from "@/app/dashboard/lib/constants";

import { Preset, type PresetOutput, type SentStep } from "./Preset";

const WILL_STEPS = ["Fund", "Refresh"];
const WILL = [output("last_will")];
const ISSUING_STEPS = ["MintReissuable", "Reissue"];
const OFFER = [output("tessera_offer")];
const RELAY = [output("relay")];
const PRE_LOCK = [
	output("pre_lock"),
	...[1, 2, 3, 4].map((vout) => output("prelock_script_auth", vout)),
];
const LENT_V2 = [
	output("lending_collateral"),
	...[2, 3].map((vout) => output("lending_script_auth", vout)),
];
const PENDING_V3 = [output("lending_collateral", 5), output("lender_nft_script_auth", 3)];
const LBTC = LIQUID_REGTEST_LBTC_ASSET_ID.split(":").at(-1)!;

function output(utxoType: string, vout = 0): PresetOutput {
	return { utxoType, vout };
}

const latestIssuance = (sent: Record<string, SentStep[]>) =>
	sent.multiasset?.findLast(({ issuances }) => issuances?.[0] !== undefined)?.issuances?.[0];

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
				spends: [output("p2pk_output")],
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
				spends: [output("maker_payout")],
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
				spends: [output("vault")],
			},
		],
		{
			contractSources: { "./relay.simf": relaySource, "./vault.simf": vaultSource },
			manifest: relayManifest,
		},
	),
	new Preset(
		"lending_v2",
		"Prepare splits a coin so each issuance has its own input. IssueUtilityNFTs sets up a loan of " +
			"10 units of the asset multiasset last minted, at 10%, against 3,400 sats of collateral, " +
			"expired from block 1. LockCollateral offers the loan; CancelOffer withdraws the offer, " +
			"SetupLending lends against the offer; then RepayLoan and ClaimPrincipalWithInterest, or " +
			"LiquidateAfterExpiry.",
		[
			{ action: "Prepare" },
			{
				action: "IssueUtilityNFTs",
				after: ISSUING_STEPS,
				from: "multiasset",
				params: (_account, earlier) => ({
					COLLATERAL_AMOUNT: 3400,
					COLLATERAL_ASSET_ID: LBTC,
					LOAN_EXPIRATION_TIME: 1,
					PRINCIPAL_AMOUNT: 10,
					PRINCIPAL_ASSET_ID: issuanceOf(earlier).issuedAsset,
					PRINCIPAL_INTEREST_RATE: 1000,
				}),
			},
			{ action: "LockCollateral", after: ["IssueUtilityNFTs"] },
			{ action: "CancelOffer", after: ["LockCollateral"], spends: PRE_LOCK },
			{ action: "SetupLending", after: ["LockCollateral"], spends: PRE_LOCK },
			{ action: "RepayLoan", after: ["SetupLending"], spends: LENT_V2 },
			{ action: "LiquidateAfterExpiry", after: ["SetupLending"], spends: LENT_V2 },
			{
				action: "ClaimPrincipalWithInterest",
				after: ["RepayLoan"],
				spends: [output("lender_principal_vault", 1)],
			},
		],
		{
			contractSources: {
				"./asset_auth.simf": lendingV2AssetAuth,
				"./lending.simf": lendingV2Lending,
				"./pre_lock.simf": lendingV2PreLock,
				"./script_auth.simf": lendingV2ScriptAuth,
			},
			manifest: lendingV2Manifest,
		},
		"lending_contract",
	),
	new Preset(
		"lending_v3",
		"CreateFactory makes an issuance factory. CreateOffer offers a loan of 10 units of the asset " +
			"multiasset last minted, at 100%, against 3,400 sats of collateral; CancelOffer withdraws " +
			"the offer, AcceptOffer lends against the offer, ClaimPrincipal takes the principal, and " +
			"RepayLoan pays the loan back.",
		[
			{ action: "CreateFactory" },
			{
				action: "CreateOffer",
				after: ["CreateFactory", "CreateOffer"],
				deployedBy: ["CreateFactory"],
				params: (_account, earlier, sent) => {
					const principal = latestIssuance(sent)?.issuedAsset;

					return principal === undefined
						? undefined
						: {
								COLLATERAL_AMOUNT: 3400,
								COLLATERAL_ASSET_ID: LBTC,
								FACTORY_ASSET_ID: earlier?.deployment?.FACTORY_ASSET_ID,
								LOAN_EXPIRATION_TIME: 1,
								PRINCIPAL_AMOUNT: 10,
								PRINCIPAL_ASSET_ID: principal,
								PRINCIPAL_INTEREST_RATE: 10_000,
								PROTOCOL_FEE_KEEPER_ASSET_ID: principal,
							};
				},
				spends: [output("issuance_factory", 1)],
			},
			{ action: "CancelOffer", after: ["CreateOffer"], spends: PENDING_V3 },
			{ action: "AcceptOffer", after: ["CreateOffer"], spends: PENDING_V3 },
			{
				action: "ClaimPrincipal",
				after: ["AcceptOffer"],
				spends: [output("principal_asset_auth", 1)],
			},
			{
				action: "RepayLoan",
				after: ["AcceptOffer"],
				spends: [output("lending_collateral_active")],
			},
		],
		{
			contractSources: {
				"./asset_auth.simf": lendingV3AssetAuth,
				"./asset_auth_vault.simf": lendingV3AssetAuthVault,
				"./issuance_factory.simf": lendingV3Factory,
				"./lending.simf": lendingV3Lending,
				"./script_auth.simf": lendingV3ScriptAuth,
			},
			manifest: lendingV3Manifest,
		},
		"lending_contract",
	),
];
