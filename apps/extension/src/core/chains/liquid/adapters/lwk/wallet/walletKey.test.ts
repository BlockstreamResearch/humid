import { describe, expect, test } from "bun:test";

import { smplx } from "../../smplx/smplxWasmForTests";
import { lwk } from "../lwkWasmForTests";
import { walletKeyOf } from "./walletKey";

const MNEMONIC =
	"abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

describe("the wallet's own key", () => {
	test("is the key the signer signs program inputs with, read from the descriptor alone", () => {
		const descriptor = new lwk.Signer(new lwk.Mnemonic(MNEMONIC), lwk.Network.testnet())
			.wpkhSlip77Descriptor()
			.toString();
		const signer = new smplx.Signer(MNEMONIC, "liquidtestnet");

		expect(walletKeyOf(descriptor, 0)).toBe(signer.schnorrPublicKey().slice(-64));
	});

	test("is refused from a descriptor that names no extended key", () => {
		expect(() => walletKeyOf("elwpkh(02aa)", 0)).toThrow();
	});
});
