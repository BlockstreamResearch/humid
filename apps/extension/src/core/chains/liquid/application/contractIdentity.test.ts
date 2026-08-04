import { describe, expect, test } from "bun:test";

import type { LiquidChainRecord } from "../chains/LiquidChainRecord";
import { readLiquidContractIdentity } from "./contractIdentity";

// The two values a person needs before a contract action can be aimed anywhere: the
// address the contract SDK signs from, and the x-only key a covenant locking to this
// wallet is parameterised with. Neither was reachable before, which is why a live run
// could not be composed at all (DISC-132).

const ADDRESS = "ert1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080";
const KEY = "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";

function chain(network: string): LiquidChainRecord {
	return { settings: { network } } as unknown as LiquidChainRecord;
}

function deps(freed: string[] = []) {
	return {
		loadSmplx: async () => ({
			WalletSigner: class {
				constructor(
					readonly mnemonic: string,
					readonly network: string,
				) {}
				address() {
					return `${ADDRESS}:${this.network}`;
				}
				free() {
					freed.push(this.mnemonic);
				}
				schnorrPublicKey() {
					return KEY;
				}
			},
		}),
		withMnemonic: async (_request: unknown, use: (mnemonic: string) => unknown): Promise<unknown> =>
			use("about about about"),
	} as never;
}

describe("the contract signing identity", () => {
	test("is the SDK signer's own address and key, not the wallet's", async () => {
		const identity = await readLiquidContractIdentity(
			{ accountGroupIndex: 0, chain: chain("testnet"), keyManagerState: {} as never },
			deps(),
		);

		expect(identity).toEqual({ address: `${ADDRESS}:liquid-testnet`, schnorrPublicKey: KEY });
	});

	test("is read on the chain's own network, so a regtest run gets regtest answers", async () => {
		const identity = await readLiquidContractIdentity(
			{ accountGroupIndex: 0, chain: chain("regtest"), keyManagerState: {} as never },
			deps(),
		);

		expect(identity.address).toBe(`${ADDRESS}:elements-regtest`);
	});

	// The signer holds key material across the wasm boundary. Leaving one alive after the
	// read would keep it there for as long as the worker lives.
	test("releases the signer once the two values are out", async () => {
		const freed: string[] = [];

		await readLiquidContractIdentity(
			{ accountGroupIndex: 0, chain: chain("mainnet"), keyManagerState: {} as never },
			deps(freed),
		);

		expect(freed).toEqual(["about about about"]);
	});

	test("refuses a network the SDK does not know rather than guessing one", async () => {
		const read = readLiquidContractIdentity(
			{ accountGroupIndex: 0, chain: chain("signet"), keyManagerState: {} as never },
			deps(),
		);

		await expect(read).rejects.toThrow("signet");
	});
});
