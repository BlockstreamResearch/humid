import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import p2pkManifest from "@humid/tx-manifest/fixtures/p2pk.manifest.json";

import { DENY_ALL_AUTHORIZATION } from "@/core/wallet-rpc/types";

import type { LiquidWalletAccount } from "../../backends/LiquidWalletBackend";
import {
	createProcessLiquidConfidentialTransaction,
	type LiquidProcessCtContext,
	type LiquidProcessCtDependencies,
	type LiquidProcessCtResult,
} from "./index";
import { PROCESS_CT_CONFIRMATION_KIND } from "./ProcessCtConfirmation";

/**
 * The whole method, driven without a browser.
 *
 * Every seam it reaches through is substituted — the contract module, the chain reads, the key
 * material, the broadcast — so what is asserted here is the method's own order and its own
 * refusals rather than what any of those do. The manifest and the contract source are the
 * published p2pk fixture, unmodified: the thinnest real protocol there is.
 */
const SOURCE_PATH = "./p2pk.simf";
const SOURCE = readFileSync(
	new URL(
		"../../../../../../../../../packages/tx-manifest/src/__fixtures__/p2pk.simf",
		import.meta.url,
	),
	"utf8",
);
const PUBKEY = "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
const POLICY_ASSET = "144c654344aa716d6f3abcc1ca90e5641e4e2a7f633bc09fe3baf64585819a49";
const COVENANT_SCRIPT = `5120${"11".repeat(32)}`;
const WALLET_SCRIPT = `0014${"33".repeat(20)}`;
const SIGNER_SCRIPT = `0014${"77".repeat(20)}`;
const BLINDING_KEY = `02${"88".repeat(32)}`;
const FUNDING_TXID = "c".repeat(64);
const COVENANT_TXID = "e".repeat(64);
const SIGNED_TXID = "f".repeat(64);
const SENT_TXID = "a".repeat(64);
const FEE_SATS = 344n;

/**
 * The finished transaction, written as the bytes one actually is.
 *
 * The method checks what came back against what was agreed to by reading these bytes rather
 * than by asking the module — a module's account of itself cannot answer whether it did
 * something it was not asked to. So a placeholder here would let that check pass without
 * seeing anything, which is the one thing this fixture exists to prevent.
 */
function txIn(txid: string, vout: number): string {
	const reversed = (txid.match(/../g) ?? []).toReversed().join("");
	const index = ((vout >>> 0).toString(16).padStart(8, "0").match(/../g) ?? [])
		.toReversed()
		.join("");

	return `${reversed}${index}00ffffffff`;
}

/** One explicit output as the chain writes one: the asset reversed, then eight value bytes. */
function txOut(scriptHex: string, sats: bigint, asset = POLICY_ASSET): string {
	const reversed = (asset.match(/../g) ?? []).toReversed().join("");
	const length = (scriptHex.length / 2).toString(16).padStart(2, "0");

	return `01${reversed}01${sats.toString(16).padStart(16, "0")}00${length}${scriptHex}`;
}

/**
 * One output whose amount and asset are commitments rather than numbers.
 *
 * The guard reads the finished transaction's own bytes, so an output the document wants hidden
 * has to actually be written hidden here — a blinding key handed to the builder is a request,
 * and whether it was applied is only visible in the encoding.
 */
function hiddenOut(scriptHex: string): string {
	const length = (scriptHex.length / 2).toString(16).padStart(2, "0");

	return `0a${"33".repeat(32)}08${"44".repeat(32)}02${"55".repeat(32)}${length}${scriptHex}`;
}

function transaction(inputs: string[], outputs: string[]): string {
	return (
		`0200000000${inputs.length.toString(16).padStart(2, "0")}${inputs.join("")}` +
		`${outputs.length.toString(16).padStart(2, "0")}${outputs.join("")}00000000`
	);
}

/** What Pay builds: the covenant output, the change the module appends, and the fee. */
const SIGNED_HEX = transaction(
	[txIn(FUNDING_TXID, 0)],
	[txOut(COVENANT_SCRIPT, 1000n), txOut(SIGNER_SCRIPT, 998_656n), txOut("", FEE_SATS)],
);

/** What the wallet's own scan reports, in the shape the backend hands over. */
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

/**
 * The covenant output, written the way the chain writes one.
 *
 * Built from the same asset, amount and script the chain reader below reports, rather than from
 * arbitrary bytes: these are what the wallet hands the builder for the input it is spending, and
 * a fixture whose bytes said something else would let the covenant path pass while carrying an
 * output that has nothing to do with what the review established.
 */
const COVENANT_HELD_SATS = 50_000n;
const COVENANT_TXOUT = txOut(COVENANT_SCRIPT, COVENANT_HELD_SATS);

type Journal = {
	broadcasts: { txHex: string }[];
	/** Every covenant input the builder was given, with the values it is spent under. */
	covenantInputs: {
		signatureWitness: string | undefined;
		source: string;
		txOutHex: string;
		txid: string;
		vout: number;
	}[];
	/** What the signer hands back, so a case can return the transaction its own plan builds. */
	finalizedHex: string;
	/** Every wasm handle taken and released, so a leak is visible rather than assumed. */
	freed: string[];
	mnemonicRequests: { accountGroupIndex?: number; keySourceId?: string }[];
	/** Whether the mnemonic was still reachable after the call that used it returned. */
	mnemonicHeldAfter: boolean;
	steps: string[];
	taken: string[];
	/** Every ordinary wallet input the builder was given. */
	walletInputs: { txOutHex: string; txid: string; vout: number }[];
};

function journal(): Journal {
	return {
		broadcasts: [],
		covenantInputs: [],
		finalizedHex: SIGNED_HEX,
		freed: [],
		mnemonicHeldAfter: false,
		mnemonicRequests: [],
		steps: [],
		taken: [],
		walletInputs: [],
	};
}

/**
 * A stand-in for the contract module, exact in the names and arities this method calls.
 *
 * A substitute that accepted anything could not notice a call the real module refuses, which is
 * the whole reason it records what it was handed rather than only that it was called.
 */
function smplxSubstitute(log: Journal) {
	class Covenant {
		constructor(
			readonly source: string,
			readonly argumentsJson?: string,
			readonly extraLeavesJson?: string,
			readonly includeDebugSymbols?: boolean,
		) {
			log.taken.push("covenant");
		}
		address() {
			return "tex1p_derived";
		}
		scriptPubKeyHex() {
			return COVENANT_SCRIPT;
		}
		free() {
			log.freed.push("covenant");
		}
	}

	class TransactionBuilder {
		constructor() {
			log.taken.push("builder");
		}
		addChange() {}
		addCovenantInput(
			txid: string,
			vout: number,
			txOutHex: string,
			source: string,
			_argumentsJson?: string,
			_witnessJson?: string,
			signatureWitness?: string,
		) {
			log.covenantInputs.push({ signatureWitness, source, txOutHex, txid, vout });
		}
		addCovenantIssuanceInput() {
			throw new Error("not reached");
		}
		addOutput() {}
		addWalletInput(txid: string, vout: number, txOutHex: string) {
			log.walletInputs.push({ txOutHex, txid, vout });
		}
		addWalletIssuanceInput() {
			throw new Error("not reached");
		}
		setLocktimeHeight() {}
		setSequence() {}
		free() {
			log.freed.push("builder");
		}
	}

	class WalletSigner {
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
		finalizeTransaction() {
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
		Covenant,
		covenantParameterTypes: () => JSON.stringify({ PUB_KEY: "Pubkey" }),
		TransactionBuilder,
		WalletSigner,
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
		getSigningAddress: () => ({ address: "tex1q_signing", index: 0 }),
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
			scriptPubKeyHex: COVENANT_SCRIPT,
			txOutHex: COVENANT_TXOUT,
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

			// Taken away again, which is the whole of what the callback shape buys: after this
			// there is no handle a later caller could reach the credential through.
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
	state: { utxos: [{ txid: COVENANT_TXID, utxo_type: "p2pk_output", vout: 0 }] },
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
	// The review is what establishes that each contract is the one the site describes. It runs
	// before the gate deliberately: a standing permission skips the prompt, and if the check sat
	// behind the prompt it would be skipped with it.
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

	// What the person is shown says which of the two authorisations is being asked for, because
	// a signature handed back and a signature broadcast are different things to agree to.
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

	// The deployment outlives the transaction, and half its fields are functions of outputs the
	// wallet chose. A caller working them out again afterwards would be guessing which.
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

	// The sentence is for a person; the token beside it is for the site. Every refusal on this
	// path shares one wire code, so without the token a caller telling "this wallet will never
	// build that" from "your state file is out of date" would have to parse English.
	test("carries the review's own reject token beside the sentence", async () => {
		const { data, message } = await failing({
			...receiveRequest(),
			state: { utxos: [] },
		});

		expect(message).toContain("state file");
		expect(data).toMatchObject({ reason: "invalid_manifest_request", reject: "no-utxo-to-spend" });
	});

	test("refuses when the chain says something else is at the covenant's outpoint", async () => {
		const { data } = await failing(receiveRequest(), {
			dependencies: {
				readTxOut: () => async () => ({
					amountSats: "50000",
					rawAssetId: POLICY_ASSET,
					scriptPubKeyHex: `0014${"99".repeat(20)}`,
					txOutHex: COVENANT_TXOUT,
				}),
			},
		});

		expect(data).toMatchObject({ reject: "covenant-mismatch" });
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
	// Every one of these is wasm memory. A collector that does not know it holds any will not
	// release them, and a refused action would leak a signer and a transaction.
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

		module.WalletSigner.prototype.finalizeTransaction = () => {
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

	test("keeps no handle on the mnemonic once the call that used it has returned", async () => {
		const { log } = await run(payRequest());

		expect(log.mnemonicHeldAfter).toBe(false);
	});

	// A session may authorise a group whose seed is not the local root. A signer built without
	// the source this account was resolved against signs with the wrong key — a valid signature,
	// over a transaction a person approved for a different account.
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

	test("asks against the local root when the account was resolved against it", async () => {
		const { log } = await run(payRequest());

		expect(log.mnemonicRequests).toEqual([{ accountGroupIndex: 3 }]);
	});
});

/**
 * The Receive action end to end, which is the path the covenant work exists for.
 *
 * Every other case here holds one seam still. This one runs the public method over a real
 * covenant spend — the state file names an outpoint, the chain reader answers with the output's
 * own bytes, the review verifies the covenant against them, the person approves, and the
 * assembler drives the builder — so it is the only thing that says the review's covenant facts
 * and the assembler's builder calls are wired to each other rather than merely each correct.
 */
describe("spending a covenant, end to end", () => {
	/** What the builder is expected to be handed, and therefore what it must give back. */
	const receiveTransaction = (outputs: string[]) =>
		transaction([txIn(COVENANT_TXID, 0), txIn(FUNDING_TXID, 0)], outputs);

	test("carries the covenant and the wallet's fee input into the builder", async () => {
		const log = journal();

		// The reclaimed funds are hidden — the document says nothing about that output and this
		// network's silence means hidden — and the change is published, which is this wallet's
		// own override so the next action of a protocol can be funded from it.
		log.finalizedHex = receiveTransaction([
			hiddenOut(WALLET_SCRIPT),
			txOut(SIGNER_SCRIPT, 999_656n),
			txOut("", FEE_SATS),
		]);

		const method = createProcessLiquidConfidentialTransaction(dependencies(log));
		const result = (await method(receiveRequest(false), context(log))) as LiquidProcessCtResult;

		// The covenant, with the bytes the chain reader answered with and the witness the
		// document says a signature goes in. The source is the contract the request supplied,
		// which is what the review compiled and compared against the chain — so this is the
		// join: what the review established reaches the builder unchanged.
		expect(log.covenantInputs).toEqual([
			{
				signatureWitness: "SIGNATURE",
				source: SOURCE,
				txOutHex: COVENANT_TXOUT,
				txid: COVENANT_TXID,
				vout: 0,
			},
		]);

		// And the wallet's own output beside it, which is what pays the fee. A covenant spend
		// that reached the builder without this would be a transaction with nothing to charge.
		expect(log.walletInputs).toEqual([
			{ txOutHex: explicitUtxo.txOut, txid: FUNDING_TXID, vout: 0 },
		]);

		// It got as far as a finished transaction, which means every guard between the plan and
		// the bytes agreed: what was spent, what was paid, and which of it was hidden.
		expect(result).toMatchObject({
			broadcast: false,
			feeSats: FEE_SATS.toString(),
			transactionHex: log.finalizedHex,
			txid: SIGNED_TXID,
		});
		expect(log.steps).toContain("confirm");
		expect(log.broadcasts).toEqual([]);
		// Nothing of the wasm is still held: the covenant compiles, the signer and the builder
		// are all handles, and a covenant spend takes more of them than any other path.
		expect(log.freed.toSorted()).toEqual(log.taken.toSorted());
	});
});
