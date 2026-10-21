import { describe, expect, test } from "bun:test";

import type { LiquidWalletAccount } from "../../../application/backends/LiquidWalletBackend";
import { lwk } from "../lwkWasmForTests";
import {
	getWalletAddress,
	getWalletReceiveAddress,
	getWalletSigningAddress,
} from "./getReceiveAddress";

const PHRASE =
	"abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

function account(): LiquidWalletAccount {
	const network = lwk.Network.testnet();
	const mnemonic = new lwk.Mnemonic(PHRASE);
	const signer = new lwk.Signer(mnemonic, network);

	try {
		const wollet = new lwk.Wollet(network, signer.wpkhSlip77Descriptor());

		return { implementation: { wollet } } as unknown as LiquidWalletAccount;
	} finally {
		signer.free();
		mnemonic.free();
		network.free();
	}
}

describe("the signing address the contract flow is funded from", () => {
	test("is fixed at the first index, where the receive address moves along", () => {
		expect(getWalletSigningAddress(account()).index).toBe(0);
	});

	test("answers with the same address twice, blinded and unblinded", () => {
		const { address, unconfidential } = getWalletSigningAddress(account());

		const blinded = new lwk.Address(address);
		const open = new lwk.Address(unconfidential);

		try {
			expect(blinded.isBlinded()).toBe(true);
			expect(open.isBlinded()).toBe(false);
			expect(open.scriptPubkey().toString()).toBe(blinded.scriptPubkey().toString());
		} finally {
			open.free();
			blinded.free();
		}
	});

	test("so the unblinded form is not the blinded one", () => {
		const { address, unconfidential } = getWalletSigningAddress(account());

		expect(unconfidential).not.toBe(address);
	});

	test("and it is the first index whatever the receive address is doing", () => {
		const shared = account();
		const pinned = getWalletSigningAddress(shared);

		expect(pinned.index).toBe(0);
		expect(getWalletReceiveAddress(shared).index).toBe(0);
	});
});

describe("an address requested by index", () => {
	test("at index 0 is the signing address", () => {
		const shared = account();
		const signing = getWalletSigningAddress(shared);
		const requested = getWalletAddress(shared, 0);

		expect(requested.address).toBe(signing.address);
		expect(requested.unconfidential).toBe(signing.unconfidential);
	});

	test("at another index is another blinded address", () => {
		const shared = account();
		const first = getWalletAddress(shared, 0);
		const other = getWalletAddress(shared, 3);
		const blinded = new lwk.Address(other.address);

		try {
			expect(other.address).not.toBe(first.address);
			expect(blinded.isBlinded()).toBe(true);
		} finally {
			blinded.free();
		}
	});

	test("comes with its unblinded form on the same script", () => {
		const { address, unconfidential } = getWalletAddress(account(), 3);
		const blinded = new lwk.Address(address);
		const open = new lwk.Address(unconfidential);

		try {
			expect(open.isBlinded()).toBe(false);
			expect(open.scriptPubkey().toString()).toBe(blinded.scriptPubkey().toString());
		} finally {
			open.free();
			blinded.free();
		}
	});
});
