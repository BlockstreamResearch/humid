import lastWillSource from "@humid/tx-manifest/fixtures/last_will/last_will.simf?raw";
import lastWillManifest from "@humid/tx-manifest/fixtures/last_will/txmanifest.json";
import p2pkSource from "@humid/tx-manifest/fixtures/p2pk/p2pk.simf?raw";
import p2pkManifest from "@humid/tx-manifest/fixtures/p2pk/txmanifest.json";

import { Preset } from "./Preset";

const WILL = { after: ["Fund", "Refresh"], utxoType: "last_will", vout: 0 };

export const PRESETS = [
	new Preset(
		"p2pk",
		"Pay locks 1,000 sats to the wallet's key; Receive spends them back.",
		[
			{ action: "Pay", params: (key) => ({ amount_sat: 1000, pubkey: key }) },
			{
				action: "Receive",
				params: (key) => ({ pubkey: key }),
				spends: { after: ["Pay"], utxoType: "p2pk_output", vout: 0 },
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
				params: (key) => ({
					COLD_PUB_KEY: key,
					HOT_PUB_KEY: key,
					INHERITOR_PUB_KEY: key,
					INHERIT_BLOCKS: "1",
					amount_sat: 1000,
				}),
			},
			{ action: "Refresh", spends: WILL },
			{ action: "ColdBreak", spends: WILL },
			{ action: "Inherit", spends: WILL },
		],
		{ contractSources: { "./last_will.simf": lastWillSource }, manifest: lastWillManifest },
		"last_will_contract",
	),
];
