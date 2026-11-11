import { describe, expect, test } from "bun:test";

import { smplx } from "../../smplx/smplxWasmForTests";
import { lwk } from "../lwkWasmForTests";
import { addressReader } from "./readAddress";

const SIGNER = new smplx.Signer(
	"abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
	"liquidtestnet",
);
const readAddress = addressReader(lwk, lwk.Network.testnet());

describe("reading an address an output pays", () => {
	test("gives a confidential address's script and the blinding key the address carries", () => {
		expect(readAddress(SIGNER.confidentialAddress())).toEqual({
			blindingPublicKeyHex: SIGNER.blindingPublicKey(),
			scriptPubKeyHex: SIGNER.scriptPubKeyHex(),
		});
	});

	test("gives an unconfidential address's script and no key", () => {
		expect(readAddress(SIGNER.address())).toEqual({ scriptPubKeyHex: SIGNER.scriptPubKeyHex() });
	});

	test("refuses an address of another network", () => {
		const mainnet = new smplx.Signer(
			"abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
			"liquid",
		);

		expect(() => readAddress(mainnet.confidentialAddress())).toThrow();
	});
});
