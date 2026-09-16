import { describe, expect, test } from "bun:test";

import { lwk } from "./lwk/lwkWasmForTests";
import { smplx } from "./smplx/smplxWasmForTests";

const PHRASE =
	"abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

const NETWORKS = [
	{ lwkNetwork: () => lwk.Network.mainnet(), name: "mainnet", smplxNetwork: "liquid" },
	{ lwkNetwork: () => lwk.Network.testnet(), name: "testnet", smplxNetwork: "liquid-testnet" },
	{
		lwkNetwork: () => lwk.Network.regtestDefault(),
		name: "regtest",
		smplxNetwork: "elements-regtest",
	},
] as const;

const SIGNING_ADDRESS_INDEX = 0;

function accountPhrase(
	network: ReturnType<(typeof NETWORKS)[number]["lwkNetwork"]>,
	group: number,
) {
	const master = new lwk.Mnemonic(PHRASE);
	const signer = new lwk.Signer(master, network);

	try {
		if (group === 0) {
			return PHRASE;
		}

		const derived = signer.derive_bip85_mnemonic(group, 12);

		try {
			return derived.toString();
		} finally {
			derived.free();
		}
	} finally {
		signer.free();
		master.free();
	}
}

function fromLwk(
	network: ReturnType<(typeof NETWORKS)[number]["lwkNetwork"]>,
	phrase: string,
): { confidential: string; scriptPubKeyHex: string; unconfidential: string } {
	const mnemonic = new lwk.Mnemonic(phrase);
	const signer = new lwk.Signer(mnemonic, network);

	try {
		const descriptor = signer.wpkhSlip77Descriptor();
		const wollet = new lwk.Wollet(network, descriptor);

		try {
			const result = wollet.address(SIGNING_ADDRESS_INDEX);
			const address = result.address();

			return {
				confidential: address.toString(),
				scriptPubKeyHex: address.scriptPubkey().toString(),
				unconfidential: address.toUnconfidential().toString(),
			};
		} finally {
			wollet.free();
		}
	} finally {
		signer.free();
		mnemonic.free();
	}
}

function fromSmplx(
	smplxNetwork: string,
	phrase: string,
): { address: string; confidentialAddress: string; scriptPubKeyHex: string } {
	const signer = new smplx.WalletSigner(phrase, smplxNetwork);

	try {
		return {
			address: signer.address(),
			confidentialAddress: signer.confidentialAddress(),
			scriptPubKeyHex: signer.scriptPubKeyHex(),
		};
	} finally {
		signer.free();
	}
}

// The wallet address is the identity, and two libraries derive it from the same mnemonic without
// either consulting the other. Nothing in the code makes them agree, so this is what says they do.
describe("smplx and LWK derive the same wallet key", () => {
	for (const { lwkNetwork, name, smplxNetwork } of NETWORKS) {
		for (const group of [0, 1]) {
			test(`the same scriptPubKey on ${name}, account group ${group}`, () => {
				const network = lwkNetwork();

				try {
					const phrase = accountPhrase(network, group);

					expect({ [name]: fromSmplx(smplxNetwork, phrase).scriptPubKeyHex }).toEqual({
						[name]: fromLwk(network, phrase).scriptPubKeyHex,
					});
				} finally {
					network.free();
				}
			});

			test(`and the same blinding key on ${name}, account group ${group}`, () => {
				const network = lwkNetwork();

				try {
					const phrase = accountPhrase(network, group);

					expect({ [name]: fromSmplx(smplxNetwork, phrase).confidentialAddress }).toEqual({
						[name]: fromLwk(network, phrase).confidential,
					});
				} finally {
					network.free();
				}
			});

			test(`and the same unconfidential address on ${name}, account group ${group}`, () => {
				const network = lwkNetwork();

				try {
					const phrase = accountPhrase(network, group);

					expect({ [name]: fromSmplx(smplxNetwork, phrase).address }).toEqual({
						[name]: fromLwk(network, phrase).unconfidential,
					});
				} finally {
					network.free();
				}
			});
		}
	}

	test("and a different account group is a different key, so the comparison means something", () => {
		const network = lwk.Network.testnet();

		try {
			const first = fromSmplx("liquid-testnet", accountPhrase(network, 0)).scriptPubKeyHex;
			const second = fromSmplx("liquid-testnet", accountPhrase(network, 1)).scriptPubKeyHex;

			expect(first).not.toBe(second);
		} finally {
			network.free();
		}
	});
});
