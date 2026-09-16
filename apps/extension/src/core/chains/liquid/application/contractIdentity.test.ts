// oxlint-disable no-await-in-loop -- the cases run one at a time because each asserts about the signer being freed before the next takes one
import { describe, expect, test } from "bun:test";

import type { LiquidChainRecord } from "../chains/LiquidChainRecord";
import { readLiquidContractIdentity } from "./contractIdentity";

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
			{ accountGroupIndex: 2 },
		]);
	});
});
