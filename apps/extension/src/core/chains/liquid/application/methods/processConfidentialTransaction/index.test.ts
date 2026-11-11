import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import p2pkManifest from "@humid/tx-manifest/fixtures/p2pk/txmanifest.json";

import { DENY_ALL_AUTHORIZATION } from "@/core/wallet-rpc/types";

import type { LiquidWalletAccount } from "../../backends/LiquidWalletBackend";
import {
	createProcessLiquidConfidentialTransaction,
	type LiquidProcessCtContext,
	type LiquidProcessCtDependencies,
	type LiquidProcessCtResult,
} from "./index";
import { PROCESS_CT_CONFIRMATION_KIND } from "./ProcessCtConfirmation";

const SOURCE_PATH = "./p2pk.simf";
const SOURCE = readFileSync(
	new URL(
		"../../../../../../../../../packages/tx-manifest/src/__fixtures__/p2pk/p2pk.simf",
		import.meta.url,
	),
	"utf8",
);
const PUBKEY = "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
const POLICY_ASSET = "144c654344aa716d6f3abcc1ca90e5641e4e2a7f633bc09fe3baf64585819a49";
const PROGRAM_SCRIPT = `5120${"11".repeat(32)}`;
const WALLET_SCRIPT = `0014${"33".repeat(20)}`;
const SIGNER_SCRIPT = `0014${"77".repeat(20)}`;
const BLINDING_KEY = `02${"88".repeat(32)}`;
const FUNDING_TXID = "c".repeat(64);
const PROGRAM_TXID = "e".repeat(64);
const SIGNED_TXID = "f".repeat(64);
const SENT_TXID = "a".repeat(64);
const FEE_SATS = 344n;

function txIn(txid: string, vout: number): string {
	const reversed = (txid.match(/../g) ?? []).toReversed().join("");
	const index = ((vout >>> 0).toString(16).padStart(8, "0").match(/../g) ?? [])
		.toReversed()
		.join("");

	return `${reversed}${index}00ffffffff`;
}

function txOut(scriptHex: string, sats: bigint, asset = POLICY_ASSET): string {
	const reversed = (asset.match(/../g) ?? []).toReversed().join("");
	const length = (scriptHex.length / 2).toString(16).padStart(2, "0");

	return `01${reversed}01${sats.toString(16).padStart(16, "0")}00${length}${scriptHex}`;
}

function blindedOut(scriptHex: string): string {
	const length = (scriptHex.length / 2).toString(16).padStart(2, "0");

	return `0a${"33".repeat(32)}08${"44".repeat(32)}02${"55".repeat(32)}${length}${scriptHex}`;
}

function transaction(inputs: string[], outputs: string[]): string {
	return (
		`0200000000${inputs.length.toString(16).padStart(2, "0")}${inputs.join("")}` +
		`${outputs.length.toString(16).padStart(2, "0")}${outputs.join("")}00000000`
	);
}

const SIGNED_HEX = transaction(
	[txIn(FUNDING_TXID, 0)],
	[txOut(PROGRAM_SCRIPT, 1000n), txOut(SIGNER_SCRIPT, 998_656n), txOut("", FEE_SATS)],
);

const explicitUtxo = {
	address: "tex1q_signing",
	amount: "1000000",
	assetId: `liquid:testnet/elip144:${POLICY_ASSET}`,
	confidential: false,
	scriptPubKey: WALLET_SCRIPT,
	scriptPubKeyHex: WALLET_SCRIPT,
	spendable: true,
	txid: FUNDING_TXID,
	txOut: `01${"49".repeat(32)}0100000000000f424000160014${"33".repeat(20)}`,
	vout: 0,
};

const PROGRAM_HELD_SATS = 50_000n;
const PROGRAM_TXOUT = txOut(PROGRAM_SCRIPT, PROGRAM_HELD_SATS);

type Journal = {
	broadcasts: { txHex: string }[];
	programInputs: {
		signatureWitness: string | undefined;
		source: string;
		txOutHex: string;
		txid: string;
		vout: number;
	}[];
	finalizedHex: string;
	freed: string[];
	mnemonicRequests: { accountGroupIndex?: number; keySourceId?: string }[];
	mnemonicHeldAfter: boolean;
	steps: string[];
	taken: string[];
	walletInputs: { txOutHex: string; txid: string; vout: number }[];
};

function journal(): Journal {
	return {
		broadcasts: [],
		programInputs: [],
		finalizedHex: SIGNED_HEX,
		freed: [],
		mnemonicHeldAfter: false,
		mnemonicRequests: [],
		steps: [],
		taken: [],
		walletInputs: [],
	};
}

function smplxSubstitute(log: Journal) {
	class Program {
		constructor(
			readonly source: string,
			readonly argumentsJson?: string,
			readonly extraLeavesJson?: string,
			readonly includeDebugSymbols?: boolean,
		) {
			log.taken.push("program");
		}
		trAddress() {
			return "tex1p_derived";
		}
		cmr() {
			return "cc".repeat(32);
		}
		scriptPubkey() {
			return PROGRAM_SCRIPT;
		}
		tapleafHash() {
			return "1e".repeat(32);
		}
		free() {
			log.freed.push("program");
		}
	}

	class TransactionBuilder {
		constructor() {
			log.taken.push("builder");
		}
		addProgramInput(
			txid: string,
			vout: number,
			txOutHex: string,
			source: string,
			_argumentsJson?: string,
			_witnessJson?: string,
			signatureWitness?: string,
		) {
			log.programInputs.push({ signatureWitness, source, txOutHex, txid, vout });
		}
		addProgramIssuanceInput() {
			throw new Error("not reached");
		}
		addOutput() {}
		addInput(txid: string, vout: number, txOutHex: string) {
			log.walletInputs.push({ txOutHex, txid, vout });
		}
		addIssuanceInput() {
			throw new Error("not reached");
		}
		setLocktimeHeight() {}
		setInputSequence() {}
		setUnusedWitnesses() {}
		free() {
			log.freed.push("builder");
		}
	}

	class Signer {
		constructor(
			readonly mnemonic: string,
			readonly network: string,
		) {
			log.taken.push("signer");
			log.steps.push(`signer:${network}`);
		}
		blindingPublicKey() {
			return BLINDING_KEY;
		}
		scriptPubKeyHex() {
			return SIGNER_SCRIPT;
		}
		static estimateStrictFee() {
			return FEE_SATS;
		}
		finalizeStrictFee() {
			log.taken.push("signed");

			return {
				feeSats: FEE_SATS,
				free: () => {
					log.freed.push("signed");
				},
				hex: log.finalizedHex,
				txid: SIGNED_TXID,
			};
		}
		free() {
			log.freed.push("signer");
		}
	}

	return {
		Program,
		programArgumentTypes: () => JSON.stringify({ PUB_KEY: "Pubkey" }),
		TransactionBuilder,
		Signer,
	};
}

const account = (overrides: Partial<LiquidWalletAccount> = {}) =>
	({
		accountGroupIndex: 3,
		accountIdentifier: "liquid:testnet:dwid",
		chain: { id: "liquid:testnet" },
		chainId: "liquid:testnet",
		descriptor: "ct(...)",
		dwid: "dwid",
		implementation: {},
		policyAssetId: `liquid:testnet/elip144:${POLICY_ASSET}`,
		rawPolicyAssetId: POLICY_ASSET,
		...overrides,
	}) as unknown as LiquidWalletAccount;

function walletBackend(log: Journal, overrides: Record<string, unknown> = {}) {
	return {
		getExplicitUtxos: (_account: unknown, asset: string) =>
			asset === POLICY_ASSET ? [explicitUtxo] : [],
		getFundingUtxos: () => [],
		getSigningAddress: () => ({
			address: "tex1q_signing",
			index: 0,
			unconfidential: "tex1q_signing_unconfidential",
		}),
		getTipHeight: () => 3_210_987,
		getUtxos: () => [],
		syncAccount: async () => {
			log.steps.push("sync");
		},
		...overrides,
	} as unknown as LiquidProcessCtContext["walletBackend"];
}

function context(log: Journal, overrides: Partial<LiquidProcessCtContext> = {}) {
	return {
		authorization: DENY_ALL_AUTHORIZATION,
		chain: {
			id: "liquid:testnet",
			settings: { backend: { url: "https://esplora.invalid" }, network: "testnet" },
		},
		confirm: async () => {
			log.steps.push("confirm");

			return true;
		},
		keyManagerState: { keyrings: [] },
		walletBackend: walletBackend(log),
		...overrides,
	} as unknown as LiquidProcessCtContext;
}

function dependencies(
	log: Journal,
	overrides: Partial<LiquidProcessCtDependencies> = {},
): LiquidProcessCtDependencies {
	return {
		broadcastTransaction: async ({ txHex }) => {
			log.steps.push("broadcast");
			log.broadcasts.push({ txHex });

			return { txid: SENT_TXID };
		},
		loadSmplx: (async () =>
			smplxSubstitute(log)) as unknown as LiquidProcessCtDependencies["loadSmplx"],
		readFeeRate: () => async () => 1000,
		readTxOut: () => async () => ({
			amountSats: "50000",
			rawAssetId: POLICY_ASSET,
			scriptPubKeyHex: PROGRAM_SCRIPT,
			txOutHex: PROGRAM_TXOUT,
		}),
		resolveAccount: (async () =>
			account()) as unknown as LiquidProcessCtDependencies["resolveAccount"],
		scriptPubKeyHexOf: async () => WALLET_SCRIPT,
		withMnemonic: (async (
			request: { accountGroupIndex?: number; keySourceId?: string },
			use: (mnemonic: string) => unknown,
		) => {
			log.steps.push("mnemonic");
			log.mnemonicRequests.push({
				...(request.accountGroupIndex === undefined
					? {}
					: { accountGroupIndex: request.accountGroupIndex }),
				...(request.keySourceId === undefined ? {} : { keySourceId: request.keySourceId }),
			});

			let held: string | undefined = "abandon abandon about";
			const answer = await use(held);

			held = undefined;
			log.mnemonicHeldAfter = held !== undefined;

			return answer;
		}) as unknown as LiquidProcessCtDependencies["withMnemonic"],
		...overrides,
	};
}

const payRequest = (broadcast = false) => ({
	action: "Pay",
	broadcast,
	contractSources: { [SOURCE_PATH]: SOURCE },
	manifest: p2pkManifest,
	params: { amount_sat: 1000, pubkey: PUBKEY },
});

const receiveRequest = (broadcast = false) => ({
	action: "Receive",
	broadcast,
	contractSources: { [SOURCE_PATH]: SOURCE },
	manifest: p2pkManifest,
	params: { pubkey: PUBKEY },
	state: { utxos: [{ txid: PROGRAM_TXID, utxo_type: "p2pk_output", vout: 0 }] },
});

async function run(
	request: unknown,
	options: {
		context?: Partial<LiquidProcessCtContext>;
		dependencies?: Partial<LiquidProcessCtDependencies>;
	} = {},
) {
	const log = journal();
	const method = createProcessLiquidConfidentialTransaction(
		dependencies(log, options.dependencies),
	);

	return {
		log,
		result: (await method(request, context(log, options.context))) as LiquidProcessCtResult,
	};
}

async function failing(
	request: unknown,
	options: Parameters<typeof run>[1] = {},
): Promise<{ data: unknown; log: Journal; message: string }> {
	const log = journal();
	const method = createProcessLiquidConfidentialTransaction(
		dependencies(log, options.dependencies),
	);

	try {
		await method(request, context(log, options.context));
	} catch (error) {
		const thrown = error as { data?: unknown; message: string };

		return { data: thrown.data, log, message: thrown.message };
	}

	throw new Error("The method was expected to refuse and did not.");
}

describe("the order a contract action happens in", () => {
	test("reviews before it asks, and signs only after agreement", async () => {
		const { log } = await run(payRequest());

		expect(log.steps.filter((step) => step !== "signer:liquid-testnet")).toEqual([
			"sync",
			"confirm",
			"mnemonic",
		]);
	});

	test("reviews even when a standing permission means nobody is asked", async () => {
		const { log } = await run(payRequest(), {
			context: { authorization: { isGranted: () => true } },
		});

		expect(log.steps).toContain("sync");
		expect(log.steps).not.toContain("confirm");
	});

	test("does not acquire the mnemonic when the person declines", async () => {
		const log = journal();
		const method = createProcessLiquidConfidentialTransaction(dependencies(log));

		await expect(
			method(payRequest(), context(log, { confirm: async () => false })),
		).rejects.toThrow();
		expect(log.steps).not.toContain("mnemonic");
		expect(log.taken).not.toContain("signer");
	});

	test("tells the confirmation whether this will be sent", async () => {
		const shown: unknown[] = [];
		const log = journal();
		const method = createProcessLiquidConfidentialTransaction(dependencies(log));

		await method(
			payRequest(true),
			context(log, {
				confirm: async (request) => {
					shown.push(request.data);

					return true;
				},
			}),
		);

		expect(shown[0]).toMatchObject({ broadcast: true, kind: PROCESS_CT_CONFIRMATION_KIND });
	});
});

describe("what comes back", () => {
	test("hands back the signed transaction and reaches no network when broadcast is off", async () => {
		const { log, result } = await run(payRequest(false));

		expect(result).toMatchObject({
			broadcast: false,
			feeSats: "344",
			transactionHex: SIGNED_HEX,
			txid: SIGNED_TXID,
		});
		expect(log.broadcasts).toEqual([]);
	});

	test("sends it and answers with the network's own txid when broadcast is on", async () => {
		const { log, result } = await run(payRequest(true));

		expect(result).toMatchObject({ broadcast: true, transactionHex: SIGNED_HEX, txid: SENT_TXID });
		expect(log.broadcasts).toEqual([{ txHex: SIGNED_HEX }]);
	});

	test("carries no deployment for an action that creates none", async () => {
		const { result } = await run(payRequest());

		expect(result.deployment).toBeUndefined();
	});
});

describe("what it refuses, and how", () => {
	test("refuses a request it cannot read as a structured invalid-params error", async () => {
		const { data, message } = await failing({ action: 7 });

		expect(message).toBeTruthy();
		expect(data).toMatchObject({ reason: "invalid_manifest_request" });
	});

	test("carries the review's own reject token beside the sentence", async () => {
		const { data, message } = await failing({
			...receiveRequest(),
			state: { utxos: [] },
		});

		expect(message).toContain("state file");
		expect(data).toMatchObject({ reason: "invalid_manifest_request", reject: "no-utxo-to-spend" });
	});

	test("refuses when the chain says something else is at the program's outpoint", async () => {
		const { data } = await failing(receiveRequest(), {
			dependencies: {
				readTxOut: () => async () => ({
					amountSats: "50000",
					rawAssetId: POLICY_ASSET,
					scriptPubKeyHex: `0014${"99".repeat(20)}`,
					txOutHex: PROGRAM_TXOUT,
				}),
			},
		});

		expect(data).toMatchObject({ reject: "program-mismatch" });
	});

	test("refuses a network the contract module does not support", async () => {
		const { message } = await failing(payRequest(), {
			context: {
				chain: {
					id: "liquid:other",
					settings: { backend: { url: "https://esplora.invalid" }, network: "elsewhere" },
				},
			} as unknown as Partial<LiquidProcessCtContext>,
		});

		expect(message).toContain("elsewhere");
	});

	test("refuses before the gate, so nothing is shown for an action it will not build", async () => {
		const { log } = await failing({ ...receiveRequest(), state: { utxos: [] } });

		expect(log.steps).not.toContain("confirm");
	});
});

describe("what it holds, and for how long", () => {
	test("releases every handle it took, on the path that succeeds", async () => {
		const { log } = await run(payRequest());

		expect(log.freed.toSorted()).toEqual(log.taken.toSorted());
		expect(log.freed).toContain("signer");
		expect(log.freed).toContain("builder");
		expect(log.freed).toContain("signed");
	});

	test("releases the signer and the builder when finalising throws", async () => {
		const log = journal();
		const module = smplxSubstitute(log);

		module.Signer.prototype.finalizeStrictFee = () => {
			throw new Error("could not balance the transaction");
		};

		const method = createProcessLiquidConfidentialTransaction(
			dependencies(log, {
				loadSmplx: (async () => module) as unknown as LiquidProcessCtDependencies["loadSmplx"],
			}),
		);

		await expect(method(payRequest(), context(log))).rejects.toThrow();
		expect(log.freed).toContain("signer");
		expect(log.freed).toContain("builder");
	});

	test("refuses a signed transaction that pays a fee other than the one shown", async () => {
		const module = smplxSubstitute(journal());
		const finalize = module.Signer.prototype.finalizeStrictFee;

		module.Signer.prototype.finalizeStrictFee = function (
			this: InstanceType<typeof module.Signer>,
		) {
			return { ...finalize.call(this), feeSats: FEE_SATS + 1n };
		};

		const { data, log } = await failing(payRequest(), {
			dependencies: {
				loadSmplx: (async () => module) as unknown as LiquidProcessCtDependencies["loadSmplx"],
			},
		});

		expect(data).toMatchObject({ reject: "built-something-else" });
		expect(log.broadcasts).toEqual([]);
	});

	test("keeps no handle on the mnemonic once the call that used it has returned", async () => {
		const { log } = await run(payRequest());

		expect(log.mnemonicHeldAfter).toBe(false);
	});

	test("asks for the mnemonic of exactly the account and key source that were resolved", async () => {
		const { log } = await run(payRequest(), {
			dependencies: {
				resolveAccount: (async () =>
					account({
						accountGroupIndex: 4,
						keySourceId: "keysource:hardware-1" as LiquidWalletAccount["keySourceId"],
					})) as unknown as LiquidProcessCtDependencies["resolveAccount"],
			},
		});

		expect(log.mnemonicRequests).toEqual([
			{ accountGroupIndex: 4, keySourceId: "keysource:hardware-1" },
		]);
	});

	test("asks against the local root when the account was resolved there", async () => {
		const { log } = await run(payRequest());

		expect(log.mnemonicRequests).toEqual([{ accountGroupIndex: 3 }]);
	});
});

describe("spending a program, end to end", () => {
	const receiveTransaction = (outputs: string[]) =>
		transaction([txIn(PROGRAM_TXID, 0), txIn(FUNDING_TXID, 0)], outputs);

	test("carries the program and the wallet's fee input into the builder it signs", async () => {
		const log = journal();

		log.finalizedHex = receiveTransaction([
			blindedOut(WALLET_SCRIPT),
			txOut(SIGNER_SCRIPT, 999_656n),
			txOut("", FEE_SATS),
		]);

		const method = createProcessLiquidConfidentialTransaction(dependencies(log));
		const result = (await method(receiveRequest(false), context(log))) as LiquidProcessCtResult;

		expect(log.programInputs.at(-1)).toEqual({
			signatureWitness: "SIGNATURE",
			source: SOURCE,
			txOutHex: PROGRAM_TXOUT,
			txid: PROGRAM_TXID,
			vout: 0,
		});
		expect(log.walletInputs.at(-1)).toEqual({
			txOutHex: explicitUtxo.txOut,
			txid: FUNDING_TXID,
			vout: 0,
		});

		expect(result).toMatchObject({
			broadcast: false,
			feeSats: FEE_SATS.toString(),
			transactionHex: log.finalizedHex,
			txid: SIGNED_TXID,
		});
		expect(log.steps).toContain("confirm");
		expect(log.broadcasts).toEqual([]);
		expect(log.freed.toSorted()).toEqual(log.taken.toSorted());
	});
});
