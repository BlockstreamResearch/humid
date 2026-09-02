// oxlint-disable no-await-in-loop -- the cases run one at a time because each asserts about the signer being freed before the next takes one
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

// The screen this serves is per-account, and the account it shows is not necessarily the
// selected one. Reading the selected account's identity there would put one account's
// address and key on another account's screen with nothing to say so — and those are the
// values someone then funds and locks a covenant to.
describe("which account it reads", () => {
	test("follows the group index it is given, so two accounts do not answer alike", async () => {
		const seen: number[] = [];
		const spy = {
			loadSmplx: async () => ({
				WalletSigner: class {
					constructor(
						readonly mnemonic: string,
						readonly network: string,
					) {}
					address() {
						return ADDRESS;
					}
					free() {}
					schnorrPublicKey() {
						return KEY;
					}
				},
			}),
			withMnemonic: async (
				request: { accountGroupIndex: number },
				use: (mnemonic: string) => unknown,
			): Promise<unknown> => {
				seen.push(request.accountGroupIndex);

				return use(`mnemonic for ${request.accountGroupIndex}`);
			},
		} as never;

		for (const accountGroupIndex of [0, 3]) {
			await readLiquidContractIdentity(
				{ accountGroupIndex, chain: chain("testnet"), keyManagerState: {} as never },
				spy,
			);
		}

		expect(seen).toEqual([0, 3]);
	});

	// A group index says which BIP-85 child; the key source says whose seed that child is
	// taken from. Read against the local root for an account whose seed is elsewhere, both
	// values on the screen belong to a different account — and what a person then sends to
	// that address cannot be spent by the transaction that signs for the real one.
	test("follows the key source it is given, so the screen shows the key that will sign", async () => {
		const asked: { accountGroupIndex: number; keySourceId?: string }[] = [];
		const spy = {
			loadSmplx: async () => ({
				WalletSigner: class {
					constructor(
						readonly mnemonic: string,
						readonly network: string,
					) {}
					address() {
						return ADDRESS;
					}
					free() {}
					schnorrPublicKey() {
						return KEY;
					}
				},
			}),
			withMnemonic: async (
				request: { accountGroupIndex: number; keySourceId?: string },
				use: (mnemonic: string) => unknown,
			): Promise<unknown> => {
				asked.push({
					accountGroupIndex: request.accountGroupIndex,
					...(request.keySourceId === undefined ? {} : { keySourceId: request.keySourceId }),
				});

				return use("about about about");
			},
		} as never;

		await readLiquidContractIdentity(
			{
				accountGroupIndex: 2,
				chain: chain("testnet"),
				keyManagerState: {} as never,
				keySourceId: "key-source:hardware-1" as never,
			},
			spy,
		);
		await readLiquidContractIdentity(
			{ accountGroupIndex: 2, chain: chain("testnet"), keyManagerState: {} as never },
			spy,
		);

		expect(asked).toEqual([
			{ accountGroupIndex: 2, keySourceId: "key-source:hardware-1" },
			// Nothing given means the local root, which is what an absent source already means
			// everywhere else it is read. Passed as absent rather than as a name for it.
			{ accountGroupIndex: 2 },
		]);
	});
});
