import { describe, expect, test } from "bun:test";

import { spentInputs, txOutAt } from "@humid/tx-manifest";
import groupedManifest from "@humid/tx-manifest/fixtures/p2pk-grouped.manifest.json";
import p2pkManifest from "@humid/tx-manifest/fixtures/p2pk.manifest.json";

import type { SmplxWasmModule } from "@/core/chains/liquid/adapters/smplx/loadSmplxWasm";

import {
	createProcessLiquidConfidentialTransaction,
	type LiquidProcessCtContext,
	type LiquidProcessCtDependencies,
} from "./index";
import {
	isProcessCtConfirmationData,
	type ProcessCtConfirmationData,
} from "./ProcessCtConfirmation";

// Drives the whole seam — parse, verify, plan, sign, broadcast — with substituted
// dependencies. What is asserted is the method's own behaviour: what it refuses, what it
// asks the chain, what it signs, and when it broadcasts.

const PUBKEY = "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
const SOURCE_PATH = "./p2pk.simf";
const SOURCE = "fn main() { }";
const DERIVED_SCRIPT = `5120${"aa".repeat(32)}`;

/** What the real module does with a hex argument, so a substitute cannot be laxer. */
function requireHex(what: string, value: string): void {
	if (!/^(?:[0-9a-fA-F]{2})+$/.test(value)) {
		throw new Error(`Invalid ${what}: Odd number of digits`);
	}
}

function requireTxid(txid: string): void {
	if (!/^[0-9a-fA-F]{64}$/.test(txid)) {
		throw new Error(`Invalid txid: ${txid}`);
	}
}

/**
 * What the real module does with a blinding key, which is parse it as a compressed public key.
 *
 * A substitute that took any string here would accept an output the module refuses, and the
 * refusal would arrive after the person had already approved.
 */
function requireBlindingKey(what: string, value: string): void {
	if (!/^0[23][0-9a-fA-F]{64}$/.test(value)) {
		throw new Error(`Invalid ${what}: malformed public key`);
	}
}
const DERIVED = "tex1p_derived";
const WALLET_ADDRESS = "tex1q_wallet";
const ROTATING_ADDRESS = "tex1q_rotating";
const WALLET_SCRIPT = "0014" + "11".repeat(20);
const ROTATING_SCRIPT = "0014" + "99".repeat(20);
const BLINDING_KEY = `02${PUBKEY}`;
const POLICY_ASSET = "144c654344aa716d6f3abcc1ca90e5641e4e2a7f633bc09fe3baf64585819a49";
const FUNDING_TXID = "d".repeat(64);

/**
 * An Elements transaction serialised from what the substituted module was actually told,
 * inputs and outputs both, so each guard is exercised against the shape of the request rather
 * than against a constant that would agree with it whatever happened.
 *
 * The output half arrived with the blinding guard and is the reason it can run at all: a
 * substitute that stopped after the inputs returned bytes with no outputs in them, which reads
 * as a transaction that builds nothing and could never disagree with the wallet about what it
 * hid. The module's own order is reproduced — the action's outputs where the wallet put them,
 * then the change it appends, then the fee — because the guard finds the change by position.
 */
function serialise(
	spends: { txid: string; vout: number }[],
	built: Built = { changeBlinded: false, outputs: [] },
): string {
	const inputs = spends
		.map(({ txid, vout }) => {
			const reversed = (txid.match(/../g) ?? []).toReversed().join("");
			const index = vout.toString(16).padStart(8, "0").match(/../g)!.toReversed().join("");

			return `${reversed}${index}00ffffffff`;
		})
		.join("");

	const outputs = [
		...built.outputs.map((output) => txOutOf(output.blinded, output.script)),
		txOutOf(built.changeBlinded, WALLET_SCRIPT),
		// The fee, which carries no script at all: the network reads the amount it charges.
		txOutOf(false, ""),
	];

	return (
		`0200000001${count(spends.length)}${inputs}` +
		`${count(outputs.length)}${outputs.join("")}00000000`
	);
}

/** What the substituted builder was told to build, in the order it was told. */
type Built = { changeBlinded: boolean; outputs: { blinded: boolean; script: string }[] };

function count(value: number): string {
	return value.toString(16).padStart(2, "0");
}

/**
 * One output the way the chain writes one.
 *
 * An explicit amount is a `01` prefix and eight bytes; a hidden one is a commitment prefix and
 * thirty-two, with a nonce beside it. Written as bytes rather than as a flag, because the only
 * thing that can establish what a transaction hides is what it is made of.
 */
function txOutOf(blinded: boolean, scriptHex: string): string {
	const length = count(scriptHex.length / 2);

	if (blinded) {
		return `0a${"33".repeat(32)}08${"44".repeat(32)}02${"55".repeat(32)}${length}${scriptHex}`;
	}

	const asset = (POLICY_ASSET.match(/../g) ?? []).toReversed().join("");

	return `01${asset}01${(1000).toString(16).padStart(16, "0")}00${length}${scriptHex}`;
}

function params(overrides: Record<string, unknown> = {}) {
	return {
		action: "Pay",
		contractSources: { [SOURCE_PATH]: SOURCE },
		manifest: p2pkManifest,
		params: { amount_sat: 50_000, pubkey: PUBKEY },
		...overrides,
	};
}

/** A context with just enough of the wallet for this method to run. */
function context(): LiquidProcessCtContext {
	return {
		authorization: { isGranted: () => true },
		chain: {
			id: "liquid:testnet",
			settings: { backend: { url: "https://esplora.example" }, network: "testnet" },
		},
		keyManagerState: {},
		walletBackend: {
			// The address a person is shown to receive at moves as addresses are used. The one a
			// contract action can spend from does not: the signing module derives a single key at
			// the account's first external address. The two differ here so a path taking the wrong
			// one is visible.
			getReceiveAddress: () => ({ address: ROTATING_ADDRESS, index: 7 }),
			getSigningAddress: () => ({ address: WALLET_ADDRESS, index: 0 }),
			// The two lists the method reads, kept honest about which is which: a contract action
			// can only spend an explicit output, so the funding one lives in the explicit list and
			// the confidential one is there to be held back. A method that stopped asking for the
			// explicit list would fail here for want of money rather than pass quietly.
			getExplicitUtxos: () => [
				{
					amount: "1000000",
					confidential: false,
					spendable: true,
					txid: FUNDING_TXID,
					txOut: "00",
					vout: 0,
				},
			],
			getUtxos: () => [
				{
					amount: "9000000",
					confidential: true,
					spendable: true,
					txid: `${"cc".repeat(32)}`,
					txOut: "00",
					vout: 0,
				},
			],
			// The height the wallet's own scan reached, which is what a covenant branch guarded by
			// a lock height reads out of the transaction it judges.
			getTipHeight: () => 2_580_990,
			syncAccount: async () => undefined,
		},
	} as unknown as LiquidProcessCtContext;
}

/**
 * What the module reports for the one output these checks issue from.
 *
 * Written out rather than computed with the wallet's own function. The point of the check is
 * that two independent derivations agree, and a substitute that called the wallet's would
 * agree by construction and prove nothing. These are the values the wallet derives for
 * `FUNDING_TXID:0` committing to no issuer contract, so a change on either side fails here.
 */
const ISSUED: IssuanceAccount = {
	assetId: "3e04c1072681d13b140419b4e1acf7084daa94fbde3accb80321ae6e8badb057",
	entropy: "d95f2c5c8e8eacb0581b8ea00e403e826049dcedbff88f3b9e609b3020e65978",
	reissuanceTokenId: "cfc308991457ed32a50cc8494cdbad89d61a9e8c3380f4ef884c0a5d82002c9e",
};

type IssuanceAccount = { assetId: string; entropy: string; reissuanceTokenId: string };

/**
 * The module's account of one issuance, held across the wasm boundary like everything else it
 * returns — so the method has to release it, and a substitute without `free` would let a leak
 * pass unnoticed.
 */
function issuanceReport(account: IssuanceAccount) {
	return { ...account, free() {} };
}

/** One issuance the builder was told to put on an input, and what it was told about it. */
type IssuedInput = {
	assetAmountSats: bigint;
	contractInput: boolean;
	inflationAmountSats: bigint;
	issuerContractHex: string | undefined;
	txid: string;
	vout: number;
};

type Recorded = {
	broadcasts: { txHex: string }[];
	/**
	 * The height the builder was told the transaction may not be mined before.
	 *
	 * Read from the builder rather than from the review, so a method that stopped passing it
	 * through fails here rather than agreeing with itself.
	 */
	locktimeHeight?: number;
	/**
	 * The sequence the builder was told every input carries.
	 *
	 * Read from the builder rather than from the review, so a method that stopped passing a
	 * declared sequence through fails here rather than agreeing with itself.
	 */
	sequence?: number;
	/**
	 * Whether the builder was told to hide the change it returns.
	 *
	 * Read from the builder rather than from the review, so a method that stopped passing the
	 * decision through fails here instead of agreeing with itself.
	 */
	changeBlinded: boolean;
	/** Every contract source the review asked for the declarations of. */
	declared: string[];
	issued: IssuedInput[];
	mnemonicCalls: number;
	/** Every output as the builder was told it: the asset and whether it hides what it carries. */
	outputs: { asset: string; blinded: boolean; script: string }[];
	paid: string[];
	/** Every address the method asked for the script of, in order. */
	scriptAsks: string[];
	/** How each covenant input was described to the builder, beyond its source. */
	covenantBuilds: { includeDebugSymbols?: boolean; leaves?: string }[];
	/** The transaction the substituted module handed back, as it handed it back. */
	signed: string;
};

/**
 * What a module does to the transaction between being told and handing it back.
 *
 * The identity by default, because a module that does what it is told is the case worth
 * running everything else against. A test supplies one when it needs the other case — the
 * module ignoring what it was told, which is precisely what the guards exist to catch and is
 * unreachable from a substitute that can only be obedient.
 */
type ModuleBehaviour = (built: Built) => Built;

/**
 * The names the substitute answers to, checked against the module it stands in for.
 *
 * Nothing else checks them. The substitute is cast where it is handed over, so a rename that
 * reached only one side of this seam passed both `tsc` and the whole suite — which is how
 * `addCovenantIssuanceInput` came to be exercised by nothing at all.
 */
type StandsInFor<Real> = <Substitute extends Real>(substitute: Substitute) => Substitute;

/** The members a substitute must declare, named as the real type names them. */
type Named<Real, Members extends keyof Real> = { [Member in Members]: unknown };

type SubstituteModule = {
	covenantParameterTypes: (source: string) => string;
	Covenant: new (
		...args: never[]
	) => Named<InstanceType<SmplxWasmModule["Covenant"]>, "address" | "free" | "scriptPubKeyHex">;
	TransactionBuilder: new () => Named<
		InstanceType<SmplxWasmModule["TransactionBuilder"]>,
		| "addChange"
		| "addCovenantInput"
		| "addCovenantIssuanceInput"
		| "addOutput"
		| "addWalletInput"
		| "addWalletIssuanceInput"
		| "free"
		| "setLocktimeHeight"
		| "setSequence"
	>;
	WalletSigner: new (
		...args: never[]
	) => Named<
		InstanceType<SmplxWasmModule["WalletSigner"]>,
		"blindingPublicKey" | "finalizeTransaction" | "free" | "scriptPubKeyHex"
	>;
};

const standsInForSmplx: StandsInFor<SubstituteModule> = (substitute) => substitute;

function dependencies(
	recorded: Recorded,
	issued: IssuanceAccount = ISSUED,
	behaviour: ModuleBehaviour = (built) => built,
): LiquidProcessCtDependencies {
	return {
		broadcastTransaction: async ({ txHex }) => {
			recorded.broadcasts.push({ txHex });

			return { txid: "f".repeat(64) };
		},
		loadSmplx: async () =>
			standsInForSmplx({
				compilerVersion: () => "0.6.0",
				// What a contract declares its compile parameters to be, which the real module
				// answers by type-checking the source. A substitute cannot type a parameter —
				// needing the compiler for exactly that is why this seam exists — so it answers
				// only for a source that declares none, and refuses the rest rather than
				// inventing a width that would silently be part of an address.
				covenantParameterTypes: (source: string) => {
					recorded.declared.push(source);

					if (/\bparam::/.test(source)) {
						throw new Error("This substitute cannot say what a contract declares.");
					}

					return "{}";
				},
				Covenant: class {
					address() {
						return DERIVED;
					}
					// Held across the wasm boundary, so the method releases it. A substitute
					// without this passes only because nothing checked that it was released.
					free() {}
					scriptPubKeyHex() {
						return DERIVED_SCRIPT;
					}
				},
				// Every argument the real builder parses is parsed here too. A substitute that
				// accepts whatever it is given is how a bech32 address reached `addOutput`
				// through a green suite (DISC-138), so the rule is now the module's own: what
				// it decodes, this decodes.
				TransactionBuilder: class {
					change: string | undefined;
					changeBlinded = false;
					/** The height the method declared, so a transaction that stops declaring one shows here. */
					locktimeHeight: number | undefined;
					/** The sequence the method declared, so one that stops being passed shows here. */
					sequence: number | undefined;
					/** Each output as it was told, so the transaction it returns carries them. */
					outputs: { blinded: boolean; script: string }[] = [];
					spends: { txid: string; vout: number }[] = [];
					// The change target moved onto the builder, and so did the parse that rejects
					// one it cannot read. Recorded rather than swallowed, so a method that stopped
					// stating where change goes fails here instead of sending it to the module's
					// own default in silence.
					setLocktimeHeight(height: number) {
						this.locktimeHeight = height;
						recorded.locktimeHeight = height;
					}
					setSequence(sequence: number) {
						this.sequence = sequence;
						recorded.sequence = sequence;
					}
					addChange(scriptPubKeyHex: string, blindingKeyHex?: string) {
						requireHex("change script", scriptPubKeyHex);

						if (blindingKeyHex !== undefined) {
							requireBlindingKey("change blinding key", blindingKeyHex);
						}

						this.change = scriptPubKeyHex;
						this.changeBlinded = blindingKeyHex !== undefined;
					}
					addCovenantInput(
						txid: string,
						vout: number,
						txOutHex: string,
						_source: string,
						_argumentsJson: string | undefined,
						_witnessJson: string | undefined,
						_signatureWitness: string | undefined,
						extraLeavesJson: string | undefined,
						includeDebugSymbols: boolean | undefined,
					) {
						requireHex("covenant input's previous output", txOutHex);
						requireTxid(txid);
						this.spends.push({ txid, vout });
						recorded.covenantBuilds.push({ includeDebugSymbols, leaves: extraLeavesJson });
					}
					addCovenantIssuanceInput(
						txid: string,
						vout: number,
						txOutHex: string,
						_source: string,
						_argumentsJson: string | undefined,
						_witnessJson: string | undefined,
						_signatureWitness: string | undefined,
						assetAmountSats: bigint,
						inflationAmountSats: bigint,
						issuerContractHex: string | undefined,
					) {
						requireHex("covenant input's previous output", txOutHex);
						requireTxid(txid);
						this.spends.push({ txid, vout });
						recorded.issued.push({
							assetAmountSats,
							contractInput: true,
							inflationAmountSats,
							issuerContractHex,
							txid,
							vout,
						});

						return issuanceReport(issued);
					}
					addOutput(
						scriptPubKeyHex: string,
						_amountSats: bigint,
						assetHex: string,
						blindingKeyHex?: string,
					) {
						requireHex("output script", scriptPubKeyHex);
						requireHex("asset id", assetHex);

						if (blindingKeyHex !== undefined) {
							requireBlindingKey("output blinding key", blindingKeyHex);
						}

						this.outputs.push({
							blinded: blindingKeyHex !== undefined,
							script: scriptPubKeyHex,
						});
						recorded.outputs.push({
							asset: assetHex,
							blinded: blindingKeyHex !== undefined,
							script: scriptPubKeyHex,
						});
						recorded.paid.push(scriptPubKeyHex);
					}
					addWalletInput(txid: string, vout: number, txOut: string) {
						requireHex("wallet input's previous output", txOut);
						requireTxid(txid);
						this.spends.push({ txid, vout });
					}
					addWalletIssuanceInput(
						txid: string,
						vout: number,
						txOut: string,
						assetAmountSats: bigint,
						inflationAmountSats: bigint,
						issuerContractHex: string | undefined,
					) {
						requireHex("wallet input's previous output", txOut);
						requireTxid(txid);
						this.spends.push({ txid, vout });
						recorded.issued.push({
							assetAmountSats,
							contractInput: false,
							inflationAmountSats,
							issuerContractHex,
							txid,
							vout,
						});

						return issuanceReport(issued);
					}
					free() {}
				},
				WalletSigner: class {
					// The wallet hides an output with its own blinding key, so the substitute has
					// to have one. Without it every path that hides anything failed here for the
					// wrong reason, which is what happened between the blinding work and now.
					blindingPublicKey() {
						return BLINDING_KEY;
					}
					finalizeTransaction(
						builder: Built & { change?: string; spends: { txid: string; vout: number }[] },
						_feeRateSatsPerKvb: number,
					) {
						if (builder.change === undefined) {
							throw new Error("The transaction was finalised without a change target.");
						}

						recorded.changeBlinded = builder.changeBlinded;
						// Kept, so a test asserting the method returns what the module built can say
						// exactly that rather than assemble the same bytes a second time and compare
						// two derivations of one thing.
						recorded.signed = serialise(builder.spends, behaviour(builder));

						return {
							feeSats: 500n,
							free: () => undefined,
							hex: recorded.signed,
							txid: "e".repeat(64),
						};
					}
					free() {}
					scriptPubKeyHex() {
						return WALLET_SCRIPT;
					}
				},
			}) as unknown as SmplxWasmModule,
		readFeeRate: () => async () => 1000,
		// Answers with bytes and reads them back through the same parser the real reader uses,
		// so this cannot hand over an output the chain could not have produced.
		readTxOut: () => async () => {
			const asset = `01${(POLICY_ASSET.match(/../g) ?? []).toReversed().join("")}`;
			const value = `01${(42_000).toString(16).padStart(16, "0")}`;
			const script = `${(DERIVED_SCRIPT.length / 2).toString(16).padStart(2, "0")}${DERIVED_SCRIPT}`;
			const parsed = txOutAt(`02000000000001${asset}${value}00${script}00000000`, 0);

			if (!parsed.ok) {
				throw new Error(parsed.reason);
			}

			return parsed.txOut;
		},
		resolveAccount: async () =>
			({ accountGroupIndex: 0, chain: {}, rawPolicyAssetId: POLICY_ASSET }) as never,
		scriptPubKeyHexOf: async (address: string) => {
			recorded.scriptAsks.push(address);

			return address === WALLET_ADDRESS ? WALLET_SCRIPT : ROTATING_SCRIPT;
		},
		withMnemonic: async (_request, use) => {
			recorded.mnemonicCalls += 1;

			return use("a test mnemonic");
		},
	};
}

function subject(issued: IssuanceAccount = ISSUED, behaviour?: ModuleBehaviour) {
	const recorded: Recorded = {
		broadcasts: [],
		changeBlinded: false,
		declared: [],
		issued: [],
		covenantBuilds: [],
		mnemonicCalls: 0,
		scriptAsks: [],
		outputs: [],
		paid: [],
		signed: "",
	};

	return {
		method: createProcessLiquidConfidentialTransaction(dependencies(recorded, issued, behaviour)),
		recorded,
	};
}

describe("processLiquidConfidentialTransaction", () => {
	test("builds and signs, returning the transaction unsent by default", async () => {
		const { method, recorded } = subject();

		const result = await method(params(), context());

		expect(result).toMatchObject({ broadcast: false, feeSats: "500" });
		expect(result.transactionHex).toBe(recorded.signed);
		expect(recorded.broadcasts).toHaveLength(0);
	});

	test("broadcasts only when the request asks, and returns the network's txid", async () => {
		const { method, recorded } = subject();

		const result = await method(params({ broadcast: true }), context());

		expect(recorded.broadcasts).toEqual([{ txHex: recorded.signed }]);
		expect(result).toMatchObject({ broadcast: true, txid: "f".repeat(64) });
	});

	// The account secret is reached once, for the signing step, and not before.
	test("reads the account mnemonic exactly once", async () => {
		const { method, recorded } = subject();

		await method(params(), context());

		expect(recorded.mnemonicCalls).toBe(1);
	});

	/**
	 * The wallet supplies the compiler, and this is the second thing the review asks it for: what
	 * a contract declares its compile parameters to be. It is asked before the contract is built,
	 * because a parameter a deployment writes as a bare value has no type until the contract
	 * states one, and the arguments cannot be assembled without it.
	 *
	 * Asserted here rather than only at the seam because a seam nothing fills is not delivered.
	 * Every covenant this wallet reviews goes through the same call.
	 */
	test("asks the compiler what each contract declares, passing the source it was given", async () => {
		const { method, recorded } = subject();

		await method(params(), context());

		expect(recorded.declared).toContain(SOURCE);
	});

	test("refuses a request missing the contract source, naming it", async () => {
		const { method, recorded } = subject();

		await expect(method(params({ contractSources: {} }), context())).rejects.toThrow(/p2pk\.simf/);
		expect(recorded.mnemonicCalls).toBe(0);
	});

	test("refuses a malformed request before reaching the wallet at all", async () => {
		const { method, recorded } = subject();

		await expect(method({ action: "Pay" }, context())).rejects.toThrow();
		expect(recorded.mnemonicCalls).toBe(0);
	});

	test("refuses an action the manifest does not declare", async () => {
		const { method } = subject();

		await expect(method(params({ action: "Withdraw" }), context())).rejects.toThrow(/Withdraw/);
	});

	// Every refusal on this path shares one wire code, so the sentence is all a caller had to go
	// on. A site telling "this wallet will never build that" from "your state file is out of
	// date" had to parse English, and one of those is worth retrying while the other never is.
	test("and names the refusal beside the sentence, so a caller can branch without reading it", async () => {
		const { method } = subject();

		const failure = await method(params({ action: "Withdraw" }), context()).then(
			() => undefined,
			(error: unknown) => error as { data?: { reject?: string } },
		);

		// `no-such-action` rather than `incomplete-request`, and the difference is worth pinning:
		// the action is looked up before anything asks what it needs, because filling a
		// parameter needs the action that declares it. So a request naming an action the
		// manifest does not declare is refused as a missing name rather than as a request that
		// cannot be built. The sentence still says "Withdraw" — the test above asserts that —
		// and the token says which check answered.
		expect(failure?.data?.reject).toBe("no-such-action");
	});
});

// AC-10 end to end: the same protocol written in the grouped shape with the older
// top-level spelling goes through the whole method and produces the same transaction.
describe("processLiquidConfidentialTransaction across declaration shapes", () => {
	test("builds and signs a grouped manifest exactly as it does a flat one", async () => {
		const flat = await subject().method(params(), context());
		const grouped = await subject().method(params({ manifest: groupedManifest }), context());

		expect(grouped).toEqual(flat);
	});

	test("finds a method declared inside a class by its own name", async () => {
		const { method, recorded } = subject();

		await method(
			params({
				action: "Receive",
				manifest: groupedManifest,
				params: { pubkey: PUBKEY },
				state: { utxos: [{ txid: "a".repeat(64), utxo_type: "p2pk_output", vout: 0 }] },
			}),
			context(),
		);

		expect(recorded.mnemonicCalls).toBe(1);
	});
});

/**
 * The order the inputs are actually built in, which is the document's wherever it states one.
 *
 * A covenant introspects positions, so this is the last place the order can still be got wrong:
 * the review works out where each input goes and the builder is what puts it there. Every
 * covenant used to be added first and the wallet's own outputs after, so a document requiring
 * one of the wallet's own to go first was refused rather than built — and the published
 * contracts that fix an input at index zero fix one the wallet supplies.
 *
 * Read off the signed transaction's own bytes rather than off the review, because what a module
 * was told and what it built are two different claims.
 */
const COVENANT_TXID = "a".repeat(64);
const spending = {
	action: "Receive",
	params: { pubkey: PUBKEY },
	state: { utxos: [{ txid: COVENANT_TXID, utxo_type: "p2pk_output", vout: 0 }] },
};

/** `Receive`, with its inputs told where to go. */
function requiring(positions: Record<string, number>) {
	const document = structuredClone(p2pkManifest) as unknown as {
		actions: { Receive: { inputs: Record<string, unknown>[] } };
	};

	for (const input of document.actions.Receive.inputs) {
		const at = positions[String(input.id)];

		if (at !== undefined) {
			input.required_index = at;
		}
	}

	return document;
}

/** The outpoints the finished transaction spends, in the order it spends them. */
function orderOf(transactionHex: string) {
	const found = spentInputs(transactionHex);

	if (!found.ok) {
		throw new Error(found.reason);
	}

	return found.spent;
}

/**
 * A covenant branch guarded by a lock height reads the transaction's own locktime, and a
 * transaction declaring none satisfies no such branch. No document in the corpus states one,
 * because the height a spend becomes valid at is a fact about the chain — so the wallet reads
 * the chain and tells the module, and this is where that stops being silent if it stops.
 */
describe("the height the transaction declares", () => {
	test("is the chain's own, handed to the module that builds it", async () => {
		const { method, recorded } = subject();

		await method(params(spending), context());

		expect(recorded.locktimeHeight).toBe(2_580_990);
	});
});

describe("the order the transaction's inputs are built in", () => {
	test("is the wallet's own — covenant first — while the document states nothing", async () => {
		const result = await subject().method(params(spending), context());

		expect(orderOf(result.transactionHex)).toEqual([
			{ txid: COVENANT_TXID, vout: 0 },
			{ txid: FUNDING_TXID, vout: 0 },
		]);
	});

	test("and puts the wallet's own input first when the document requires that", async () => {
		const result = await subject().method(
			params({ ...spending, manifest: requiring({ fee_input: 0, p2pk_in: 1 }) }),
			context(),
		);

		expect(orderOf(result.transactionHex)).toEqual([
			{ txid: FUNDING_TXID, vout: 0 },
			{ txid: COVENANT_TXID, vout: 0 },
		]);
	});

	// Being able to reorder is not a way to stop refusing: two inputs cannot both be input zero,
	// and the wallet says so before anything is signed rather than after the network rejects it.
	test("while a position no order could satisfy is refused, and nothing is signed", async () => {
		const { method, recorded } = subject();

		await expect(
			method(params({ ...spending, manifest: requiring({ fee_input: 0, p2pk_in: 0 }) }), context()),
		).rejects.toThrow(/fee_input/);
		expect(recorded.mnemonicCalls).toBe(0);
	});
});

// AC-11 at the seam it actually protects: the guard reads the finished transaction's own
// bytes, so a module that spends something nobody asked for is caught even though every
// other part of the request was well formed.
describe("processLiquidConfidentialTransaction guards what it signs", () => {
	function subjectSpending(extra: { txid: string; vout: number }) {
		const recorded: Recorded = {
			broadcasts: [],
			changeBlinded: false,
			covenantBuilds: [],
			declared: [],
			issued: [],
			mnemonicCalls: 0,
			scriptAsks: [],
			outputs: [],
			paid: [],
			signed: "",
		};
		const dependency = dependencies(recorded);

		return {
			method: createProcessLiquidConfidentialTransaction({
				...dependency,
				loadSmplx: async () => {
					const module = (await dependency.loadSmplx()) as never as {
						TransactionBuilder: new () => { spends: { txid: string; vout: number }[] };
					};

					return {
						...module,
						TransactionBuilder: class extends module.TransactionBuilder {
							// Stands in for a module doing something it was not asked to.
							free() {}
							addOutput() {
								this.spends.push(extra);
							}
						},
					} as never;
				},
			}),
			recorded,
		};
	}

	test("refuses a transaction spending an input nobody asked for, naming it", async () => {
		const { method } = subjectSpending({ txid: "9".repeat(64), vout: 2 });

		await expect(method(params(), context())).rejects.toThrow(/9{64}:2/);
	});

	test("and nothing reaches the network", async () => {
		const { method, recorded } = subjectSpending({ txid: "9".repeat(64), vout: 2 });

		await expect(method(params({ broadcast: true }), context())).rejects.toThrow();
		expect(recorded.broadcasts).toHaveLength(0);
	});
});

// AC-14 and D7: a person who wipes the wallet and restores from the recovery phrase must be
// able to perform the same action. There is nothing to restore *to* — so what is shown is
// that the method is a function of the request, the phrase and the chain, and that a second
// run on a context built from nothing else reaches the same transaction.
describe("processLiquidConfidentialTransaction on a restored wallet", () => {
	test("the same request twice, on contexts sharing nothing, reaches the same transaction", async () => {
		const first = await subject().method(params(), context());
		const restored = await subject().method(params(), context());

		expect(restored).toEqual(first);
	});

	test("and reaches the same transaction whether or not one ran before it", async () => {
		const alone = await subject().method(params(), context());
		const { method } = subject();

		await method(params({ broadcast: true }), context());

		expect(await method(params(), context())).toEqual(alone);
	});

	// What it reads from the wallet is the point: the account, its own outputs and an address,
	// all of which a restored wallet derives from the phrase by scanning. Anything else would
	// be something a previous run left behind.
	test("reads nothing from the wallet a restored one could not derive", async () => {
		const read: string[] = [];
		const base = context();
		const watched = new Proxy(base, {
			get(target, property) {
				if (typeof property === "string") {
					read.push(property);
				}

				return target[property as keyof typeof target];
			},
		});

		await subject().method(params(), watched);

		expect([...new Set(read)].toSorted()).toEqual([
			"authorization",
			"chain",
			"keyManagerState",
			"walletBackend",
		]);
	});
});

// The confirmation screen was never driven from the method, only from data a test wrote
// by hand — so a payload that no renderer could read shipped, and a person calling the
// method got a black window that timed out into "User rejected the request" (DISC-137).
// Both halves of that are asserted here against the real payload.
describe("what the person is actually shown", () => {
	async function shownRequest() {
		let captured: { data?: unknown } | undefined;

		await subject().method(params(), {
			...context(),
			authorization: { isGranted: () => false },
			confirm: async (request: { data?: unknown }) => {
				captured = request;

				return true;
			},
		} as unknown as LiquidProcessCtContext);

		return captured;
	}

	test("the payload is one the confirmation surface recognises", async () => {
		const request = await shownRequest();

		expect(isProcessCtConfirmationData(request?.data)).toBe(true);
	});

	test("and survives the message bus, which serializes as JSON and cannot carry a bigint", async () => {
		const request = await shownRequest();

		expect(() => JSON.stringify(request?.data)).not.toThrow();
	});

	test("carrying the wallet's own figures, not the site's claims", async () => {
		const request = await shownRequest();
		const data = request?.data as ProcessCtConfirmationData;

		expect(data.shown.netEffect.length).toBeGreaterThan(0);
		// `computed` rather than `verified`: the balance change is arithmetic over chain
		// reads, and combining takes the weaker origin so the sum cannot claim more than its
		// parts. What matters on this screen is that it is not the site's word.
		expect(data.shown.netEffect[0]?.sats.origin).toBe("computed");
		expect(data.shown.protocol.origin).toBe("site");
	});

	// The wallet hides amounts on someone's behalf, so it says which and on whose word. This
	// action pays a covenant and returns change, and only one of those can hide anything: a
	// Simplicity program reads exact amounts through jets that cannot introspect a
	// commitment, so the covenant output is not on this list and cannot be.
	//
	// Neither is the change, and it used to be the only thing on it. The wallet publishes a
	// contract action's own change now, so this action hides nothing at all.
	test("and every amount it hides, with whose word decided each one", async () => {
		const request = await shownRequest();
		const data = request?.data as ProcessCtConfirmationData;

		expect(data.shown.hiddenAmounts).toEqual([]);
	});

	// And the amount it publishes instead. The sentence has to lead with the word that was set
	// aside — here nobody asked, and this network's own answer is to hide — before it says the
	// wallet published it anyway. A wallet that overrode a protocol without saying so, in the
	// one place this person was just told to trust its reading, would be worth less than one
	// that had told them nothing.
	test("and every amount it publishes that the format would have hidden", async () => {
		const request = await shownRequest();
		const data = request?.data as ProcessCtConfirmationData;

		expect(
			data.shown.publishedAmounts.map((published) => ({
				id: published.id.value,
				// The reading is this wallet's, and so is the rule it applied, so it says so.
				origin: published.reason.origin,
				reason: published.reason.value,
			})),
		).toEqual([
			{
				id: "change",
				origin: "computed",
				reason:
					"nothing says otherwise and this network hides an output by default, and this " +
					"wallet publishes it anyway so your next action can spend it",
			},
		]);
	});
});

// The transaction builder hex-decodes every output script it is given, so a value that is
// not hex fails inside the module with "Invalid script: Odd number of digits" — an error
// that names neither the output nor what was wrong with it. A covenant output was paid to
// the bech32 address the wallet derived, because the address and the scriptPubKey were two
// spellings of one fact reached by two different calls (DISC-138).
describe("what the outputs actually pay to", () => {
	test("every output script is hex the builder can decode", async () => {
		const { method, recorded } = subject();

		await method(params(), context());

		expect(recorded.paid.length).toBeGreaterThan(0);

		for (const script of recorded.paid) {
			expect(script).toMatch(/^(?:[0-9a-fA-F]{2})+$/);
		}
	});

	test("and the covenant output pays the script, not the address it is shown as", async () => {
		const { method, recorded } = subject();

		await method(params(), context());

		expect(recorded.paid).toContain(DERIVED_SCRIPT);
		expect(recorded.paid).not.toContain(DERIVED);
	});
});

describe("how a covenant being spent is rebuilt", () => {
	/*
	 * The script a covenant locks to is decided by four things: the source, the parameters, the
	 * extra taproot leaves and the build mode. The review compiles with all four and compares the
	 * result against the chain; the module that signs compiles again, and used to be told only the
	 * first two. A document declaring debug symbols therefore reviewed clean and failed at
	 * execution with a script-pubkey mismatch, after the person had approved it.
	 */
	test("is told the leaves and the build mode the review verified it under", async () => {
		const { method, recorded } = subject();

		// `Receive` spends the covenant rather than paying into one, which is the case where the
		// module compiles a contract that already exists on chain.
		await method(params(spending), context());

		expect(recorded.covenantBuilds.length).toBeGreaterThan(0);
		for (const build of recorded.covenantBuilds) {
			expect(build.includeDebugSymbols).toBeBoolean();
			expect(build.leaves).toBeString();
		}
	});
});

describe("where an output paid to this wallet lands", () => {
	/*
	 * A contract action can spend only what sits at the account's first external address —
	 * the signing module derives one key, at that index, and signs every wallet input with it.
	 * An output paid back to this wallet at any other address is money this path cannot spend
	 * again, which is what happened live: a factory's auth token landed on a rotating address
	 * and the next action, which has to spend it, could never find it.
	 */
	test("is the address this path can spend from, not the one shown for receiving", async () => {
		const { method, recorded } = subject();

		// A protocol that hands units back: the output carrying them is destined for the wallet,
		// which is the case that goes wrong on a rotating address.
		await method(params({ manifest: issuingManifest() }), context());

		expect(recorded.scriptAsks).toContain(WALLET_ADDRESS);
		expect(recorded.scriptAsks).not.toContain(ROTATING_ADDRESS);
		expect(recorded.paid).toContain(WALLET_SCRIPT);
		expect(recorded.paid).not.toContain(ROTATING_SCRIPT);
	});
});

/**
 * The same protocol with its funding input creating an asset.
 *
 * Written here rather than vendored because no published manifest this wallet can build
 * declares an issuance: the ones in the corpus that do reach for constructs it refuses first,
 * so a fixture taken from them would assert a refusal and never reach the builder.
 */
function issuingManifest(
	issuance: Record<string, unknown> = { asset_amount_sat: 1_000, kind: "new" },
) {
	const manifest = structuredClone(p2pkManifest) as unknown as {
		actions: { Pay: { inputs: Record<string, unknown>[]; outputs: Record<string, unknown>[] } };
	};
	const [funding] = manifest.actions.Pay.inputs;

	if (!funding) {
		throw new Error("the fixture's Pay action declares no inputs");
	}

	funding.issuance = issuance;
	// Where the created units land. An issuance mints them into the transaction, and a
	// transaction holding units no output accounts for is one the network will not balance —
	// so every published protocol that issues something also declares where it goes, and a
	// fixture that did not was asserting against a transaction nobody could have broadcast.
	funding.on_resolved = { set: { "instance.MINTED_ASSET": "asset" } };
	manifest.actions.Pay.outputs.push({
		amount_sat: issuance.asset_amount_sat,
		asset: "instance.MINTED_ASSET",
		confidential: false,
		description: "The units this action created, returned to the wallet that made them.",
		destination: "wallet",
		id: "minted_out",
	});

	return manifest;
}

/** The same protocol with its funding input declaring a sequence. */
function sequencedManifest(sequence: unknown) {
	const manifest = structuredClone(p2pkManifest) as unknown as {
		actions: { Pay: { inputs: Record<string, unknown>[] } };
	};
	const [funding] = manifest.actions.Pay.inputs;

	if (!funding) {
		throw new Error("the fixture's Pay action declares no inputs");
	}

	funding.sequence = sequence;

	return manifest;
}

// The module takes one sequence for the transaction and writes it onto every input that
// declares none, so a declaration either collapses to one value the whole transaction can
// carry or it is refused. Dropping one builds a transaction the protocol did not ask for,
// which the chain rejects on broadcast far from anything that explains it.
describe("the sequence the transaction declares", () => {
	// 0xFFFFFFFE carries BIP68's disable bit, so it constrains no input and only enables the
	// transaction's own locktime. That is what every such declaration in the corpus is for.
	test("is handed to the module when the action declares one that constrains nothing", async () => {
		const { method, recorded } = subject();

		await method(params({ manifest: sequencedManifest(4_294_967_294) }), context());

		expect(recorded.sequence).toBe(4_294_967_294);
	});

	test("and is left unset where the action declares nothing", async () => {
		const { method, recorded } = subject();

		await method(params(), context());

		expect(recorded.sequence).toBeUndefined();
	});

	// A relative timelock is measured against the age of the input carrying it, so writing one
	// onto the outputs funding the transaction time-locks those too. Refused rather than built
	// as something else.
	test("but a relative timelock is refused, because it cannot be carried by one input alone", async () => {
		const { method } = subject();

		const failure = await method(
			params({ manifest: sequencedManifest({ relative_blocks: 6 }) }),
			context(),
		).then(
			() => undefined,
			(error: unknown) => error as { data?: { reject?: string } },
		);

		expect(failure?.data?.reject).toBe("unimplemented-construct");
	});
});

// The asset an action creates is worked out while the document is read, from an output the
// wallet commits to before anything else runs. Until now none of that reached the module, so
// the wallet showed a person an asset and signed a transaction that created nothing.
describe("an input that creates an asset", () => {
	test("carries the issuance the wallet settled, on the output it was derived from", async () => {
		const { method, recorded } = subject();

		await method(params({ manifest: issuingManifest() }), context());

		expect(recorded.issued).toEqual([
			{
				assetAmountSats: 1_000n,
				contractInput: false,
				inflationAmountSats: 0n,
				// Nothing is stated, because a manifest declares no issuer contract at any
				// position. Both sides commit to the empty one and each says so.
				issuerContractHex: undefined,
				txid: FUNDING_TXID,
				vout: 0,
			},
		]);
	});

	test("and the transaction it signs spends that same output", async () => {
		const { method, recorded } = subject();

		const result = await method(params({ manifest: issuingManifest() }), context());

		expect(result.transactionHex).toBe(recorded.signed);
	});

	test("while an action that creates nothing tells the builder about no issuance", async () => {
		const { method, recorded } = subject();

		await method(params(), context());

		expect(recorded.issued).toEqual([]);
	});

	// A reissuance needs the entropy of an issuance that already happened, which reaches a
	// request only on a supplied input this wallet does not read. Refused by name rather than
	// minting a different asset under the protocol's name.
	test("but reissuing is refused by name rather than derived from this transaction", async () => {
		const { method } = subject();

		const failure = await method(
			params({ manifest: issuingManifest({ asset_amount_sat: 1_000, kind: "reissue" }) }),
			context(),
		).then(
			() => undefined,
			(error: unknown) => error as { data?: { reject?: string } },
		);

		expect(failure?.data?.reject).toBe("unimplemented-construct");
	});
});

// The asset an action creates is the first fact the wallet and the signing module each work
// out for themselves, from the same output. They should agree, and a silent disagreement
// means one of them is creating a different asset than the other with nothing downstream able
// to tell which.
// An output pays in the asset the document states for it. Every output used to be built in
// this account's policy asset, so a protocol moving its own token would have paid real money
// to a covenant expecting the token — a transaction the wallet would have signed.
describe("what asset each output is built in", () => {
	test("is the one the review worked out, not this account's policy asset", async () => {
		const { method, recorded } = subject();

		await method(params({ manifest: issuingManifest() }), context());

		const minted = recorded.outputs.filter((output) => output.asset === ISSUED.assetId);

		expect(minted.length).toBe(1);
		// And the rest of them are still the network's own, so this is a distinction rather than
		// a second blanket assumption.
		expect(recorded.outputs.some((output) => output.asset === POLICY_ASSET)).toBe(true);
	});
});

describe("when the module disagrees about the asset it issued", () => {
	test("the two derivations agreeing is what lets the transaction be signed", async () => {
		const { method, recorded } = subject();

		const result = await method(params({ manifest: issuingManifest() }), context());

		expect(result.transactionHex).toBe(recorded.signed);
	});

	test("a different asset refuses, and says which value disagreed", async () => {
		const { method } = subject({ ...ISSUED, assetId: `${"0".repeat(63)}1` });

		const failure = await method(params({ manifest: issuingManifest() }), context()).then(
			() => undefined,
			(error: unknown) => error as { data?: { reject?: string }; message?: string },
		);

		expect(failure?.data?.reject).toBe("built-something-else");
		expect(failure?.message).toContain("asset");
		expect(failure?.message).toContain(ISSUED.assetId);
	});

	// Two of the three agreeing is still a disagreement about what is being created, so each
	// one is its own case rather than the asset standing in for all three.
	test("a different reissuance token refuses too", async () => {
		const { method } = subject({ ...ISSUED, reissuanceTokenId: `${"0".repeat(63)}2` });

		const failure = await method(params({ manifest: issuingManifest() }), context()).then(
			() => undefined,
			(error: unknown) => error as { data?: { reject?: string }; message?: string },
		);

		expect(failure?.data?.reject).toBe("built-something-else");
		expect(failure?.message).toContain("reissuance token");
	});

	test("and so does a different entropy", async () => {
		const { method } = subject({ ...ISSUED, entropy: `${"0".repeat(63)}3` });

		const failure = await method(params({ manifest: issuingManifest() }), context()).then(
			() => undefined,
			(error: unknown) => error as { data?: { reject?: string }; message?: string },
		);

		expect(failure?.data?.reject).toBe("built-something-else");
		expect(failure?.message).toContain("entropy");
	});

	// The wallet's own derivation is what decides. A comparison that lowered one side only
	// could pass while the values differ, so both are lowered and the same value written the
	// other way round is still the same value.
	test("the same value in another case is not a disagreement", async () => {
		const { method, recorded } = subject({
			assetId: ISSUED.assetId.toUpperCase(),
			entropy: ISSUED.entropy.toUpperCase(),
			reissuanceTokenId: ISSUED.reissuanceTokenId.toUpperCase(),
		});

		const result = await method(params({ manifest: issuingManifest() }), context());

		expect(result.transactionHex).toBe(recorded.signed);
	});
});

/**
 * The check that the transaction hides what the wallet decided to hide.
 *
 * Which outputs hide anything is settled while the document is read, and all that reaches the
 * module is a blinding key or nothing. Whether it was applied is only visible in the bytes,
 * and until this guard nothing looked: the method handed the module a key, took back a
 * transaction, and returned it.
 *
 * Both failures are silent and neither is recoverable. An amount published that the protocol
 * meant kept is on the chain for good. An amount hidden on an output a covenant will later
 * read is money that cannot be spent, because a Simplicity program reads exact amounts
 * through jets that cannot introspect a commitment.
 */
/** A module that takes every blinding key it is given and builds the output open anyway. */
const ignoringKeys: ModuleBehaviour = (built) => ({
	changeBlinded: false,
	outputs: built.outputs.map((output) => ({ ...output, blinded: false })),
});

/** A module that hides every output, including the ones a covenant has to read. */
const hidingEverything: ModuleBehaviour = (built) => ({
	changeBlinded: true,
	outputs: built.outputs.map((output) => ({ ...output, blinded: true })),
});

/**
 * A module that builds every declared output as it was told and hides the change anyway.
 *
 * The direction that matters now. The wallet publishes a contract action's own change so the
 * money returns in a form the next action can be funded from, and a module hiding it strands
 * exactly that money — the next action can spend only what is already in the open, and nothing
 * downstream of the module would say so.
 */
const hidingTheChange: ModuleBehaviour = (built) => ({ ...built, changeBlinded: true });

describe("what the transaction actually hides", () => {
	test("is what the wallet decided: the covenant output open, the change published", async () => {
		const { method, recorded } = subject();

		await method(params(), context());

		// A covenant output can never hide what it carries, whatever a document says, and this
		// is the wallet acting on that rather than stating it.
		expect(recorded.outputs).toEqual([
			{ asset: POLICY_ASSET, blinded: false, script: DERIVED_SCRIPT },
		]);
		// And the change is handed over without a blinding key, which the document did not ask
		// for and this network's own default is against. It is the one place the wallet answers
		// over the format, and it buys change the next action can actually be funded from.
		expect(recorded.changeBlinded).toBe(false);
	});

	// The module this used to catch, kept because what it now proves is the change reaching the
	// guard. It publishes every amount it is given a key for, and that is precisely what the
	// wallet asked for here: the covenant output could never hide, and the change is published
	// deliberately. An expectation that had not followed the decision would refuse this.
	test("and a module that publishes everything is now exactly what the wallet asked for", async () => {
		const { method, recorded } = subject(ISSUED, ignoringKeys);

		const result = await method(params(), context());

		expect(result).toMatchObject({ broadcast: false });
		expect(recorded.changeBlinded).toBe(false);
	});

	test("and a module that hid the change the wallet published returns nothing", async () => {
		const { method } = subject(ISSUED, hidingTheChange);

		const failure = await method(params(), context()).then(
			() => undefined,
			(error: unknown) => error as { data?: { reject?: string }; message?: string },
		);

		expect(failure?.data?.reject).toBe("built-something-else");
		expect(failure?.message).toContain("hides the amount on the change");
	});

	test("and a module that hid what the wallet left open returns nothing", async () => {
		const { method } = subject(ISSUED, hidingEverything);

		const failure = await method(params(), context()).then(
			() => undefined,
			(error: unknown) => error as { data?: { reject?: string }; message?: string },
		);

		expect(failure?.data?.reject).toBe("built-something-else");
		expect(failure?.message).toContain("hides the amount on p2pk_out");
	});

	// The refusal happens after signing and before anything leaves, which is the only place
	// it can: the bytes do not exist until the module has built them.
	test("and nothing is broadcast when the guard refuses", async () => {
		const { method, recorded } = subject(ISSUED, hidingTheChange);

		await method(params({ broadcast: true }), context()).catch(() => undefined);

		expect(recorded.broadcasts).toHaveLength(0);
	});
});
