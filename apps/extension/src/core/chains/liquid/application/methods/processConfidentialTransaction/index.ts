import { SMPLX_COMPILER_VERSION } from "@humid/smplx-compiler";
import {
	createEsploraFeeRateReader,
	createEsploraTxOutReader,
	isRefusal,
	type ManifestReview,
	type ParsedLiquidProcessCtParams,
	parseLiquidProcessCtParams,
	type ReadFeeRate,
	type ReadTxOut,
	reviewManifestAction,
	toShownConfirmation,
} from "@humid/tx-manifest";

import { createWalletMethod } from "@/core/wallet-methods/createWalletMethod";
import { WALLET_RPC_ERROR_REASONS, WalletRpcInvalidParamsError } from "@/core/wallet-rpc/errors";

import { toScriptPubKeyHex } from "../../../adapters/lwk/wallet/toScriptPubKeyHex";
import { withAccountMnemonic } from "../../../adapters/lwk/wallet/withAccountMnemonic";
import { assembleReviewedTransaction } from "../../../adapters/smplx/assembleReviewedTransaction";
import {
	createSmplxContractParamTypes,
	createSmplxCovenantCompiler,
	createSmplxScriptPubKeyCompiler,
} from "../../../adapters/smplx/compileCovenantWithSmplx";
import { loadSmplxWasm } from "../../../adapters/smplx/loadSmplxWasm";
import type { LiquidChainRecord } from "../../../chains/LiquidChainRecord";
import { LIQUID_WALLET_RPC_METHODS } from "../../../domain/LiquidRpc";
import type { LiquidWalletAccount } from "../../backends/LiquidWalletBackend";
import { resolveDappAccount } from "../../dappAccountScope";
import type { LiquidRpcMethodContext } from "../../LiquidRpcContext";
import { PROCESS_CT_CONFIRMATION_KIND } from "./ProcessCtConfirmation";

export type LiquidProcessCtContext = LiquidRpcMethodContext;

export type LiquidProcessCtResult = {
	/** Whether this transaction was sent, which is what the request asked for. */
	broadcast: boolean;
	/**
	 * The deployment this action brought into existence, when it created one.
	 *
	 * Absent for every action that only spends what already exists. Returned rather than left
	 * for the caller to work out again, because half of these fields are functions of outputs
	 * the wallet chose — an asset id is derived from the output its issuing input spends — and
	 * a caller reconstructing them afterwards would be guessing which output that was. The
	 * deployment outlives the transaction; this is where it can still be read.
	 */
	deployment?: Record<string, string>;
	/** What the network charged, as a string: this crosses a bus that cannot carry a bigint. */
	feeSats: string;
	transactionHex: string;
	txid: string;
};

/** The network names the SDK understands, keyed by the wallet's own network kind. */
const SMPLX_NETWORKS: Record<string, string> = {
	mainnet: "liquid",
	regtest: "elements-regtest",
	testnet: "liquid-testnet",
};

/**
 * Everything the method reaches outside itself.
 *
 * Named as one object so the whole seam — parse, review, confirm, sign, broadcast — can be
 * driven in a test. Without this the only way to exercise the method is to build the extension
 * and run it in a browser, which is why nothing did.
 */
export type LiquidProcessCtDependencies = {
	/**
	 * Sends a finished transaction, which is the one step that reaches the network.
	 *
	 * Loaded lazily where it is wired below rather than imported at the top, because the
	 * sync-worker client reaches for `webextension-polyfill` and that throws outside an
	 * extension — and nothing else on this path needs a browser.
	 */
	broadcastTransaction: (input: {
		chain: LiquidChainRecord;
		txHex: string;
	}) => Promise<{ txid: string }>;
	loadSmplx: typeof loadSmplxWasm;
	readFeeRate: (chain: LiquidChainRecord) => ReadFeeRate;
	readTxOut: (chain: LiquidChainRecord) => ReadTxOut;
	resolveAccount: typeof resolveDappAccount;
	scriptPubKeyHexOf: (address: string) => Promise<string>;
	/**
	 * Runs one function with the account's mnemonic and takes it away again afterwards.
	 *
	 * A callback rather than a getter, and that is the whole of its safety: there is no handle
	 * a later caller could reach the credential through, and nothing on this path holds one
	 * outside the single call that signs.
	 */
	withMnemonic: typeof withAccountMnemonic;
};

/** How the method is wired in the extension. Tests substitute only what they exercise. */
export const liquidProcessCtDependencies: LiquidProcessCtDependencies = {
	broadcastTransaction: async (input) => {
		const { getSyncWorkerClient } =
			await import("../../../adapters/lwk/sync-worker/createSyncWorkerClient");

		return getSyncWorkerClient().broadcastTransaction(input);
	},
	loadSmplx: loadSmplxWasm,
	readFeeRate: (chain) => createEsploraFeeRateReader(chain.settings.backend),
	readTxOut: (chain) => createEsploraTxOutReader(chain.settings.backend),
	resolveAccount: resolveDappAccount,
	scriptPubKeyHexOf: toScriptPubKeyHex,
	withMnemonic: withAccountMnemonic,
};

/**
 * Performs one action of a txManifest protocol. The site sends the manifest, the sources of the
 * contracts it references, the chosen action and its filled parameters; everything else happens
 * inside the extension.
 *
 * The wallet establishes for itself that each contract is the one the site describes: it
 * rebuilds every covenant from source, and for one being spent compares the derived script
 * against what the chain says is at that outpoint. A mismatch refuses, and there is no way to
 * click through it.
 *
 * That check lives in `review` deliberately. `review` runs before the permission gate, so a
 * standing permission — which skips the prompt entirely — cannot skip the verification with it.
 * Everything the review cannot establish comes back as a refusal carrying a token beside its
 * sentence, and both cross to the caller: the sentence is for a person and the token is for a
 * program, and a caller handed only the first has to parse English to tell "this wallet will
 * never build that" from "your state file is out of date".
 *
 * A factory rather than a constant so the whole of it can be driven without a browser. The
 * registered method is one instance of it, wired to the real dependencies.
 */
export const createProcessLiquidConfidentialTransaction = (
	dependencies: LiquidProcessCtDependencies = liquidProcessCtDependencies,
) =>
	createWalletMethod<
		ParsedLiquidProcessCtParams,
		LiquidProcessCtContext,
		ManifestReview,
		LiquidProcessCtResult
	>({
		confirmation: ({ params, review }) => ({
			data: {
				// What the request asked for, so the screen can say whether agreeing sends this or
				// hands it back. Two different things to agree to, and one button for both would
				// be describing something this surface does not do.
				broadcast: params.broadcast,
				kind: PROCESS_CT_CONFIRMATION_KIND,
				// The whole model the person is shown, amounts as strings: this crosses the message
				// bus, which serializes as JSON, and JSON.stringify throws on a bigint rather than
				// rounding it. Every covenant the wallet rebuilt is inside it, with what it
				// established about each — `not-yet-on-chain` marks one being created, which there
				// is nothing to compare against and is a different fact rather than a weaker one.
				shown: toShownConfirmation(review.confirmation),
			},
			message: `A site wants to perform "${review.action}" on the ${review.protocol} protocol.`,
			title: "Perform a contract action?",
		}),
		execute: async ({ context, params, review }) => {
			const network = requireNetwork(context);
			const account = await dependencies.resolveAccount(context);
			const smplx = await dependencies.loadSmplx();

			// Everything except signing was settled in `review`, before the person was asked. What
			// gets signed here is the transaction they were shown: the plan is driven as it stands
			// and the document is not read again, so there is no second resolution that could
			// disagree with the first.
			const assembled = await dependencies.withMnemonic(
				{
					...(account.accountGroupIndex === undefined
						? {}
						: { accountGroupIndex: account.accountGroupIndex }),
					chain: context.chain,
					keyManagerState: context.keyManagerState,
					// The source this account was actually resolved against, not the local root by
					// default. A session may authorise a group whose seed is a different one, and a
					// signer built without this signs with the wrong key — a valid signature over a
					// transaction a person approved for a different account.
					...(account.keySourceId === undefined ? {} : { keySourceId: account.keySourceId }),
				},
				async (mnemonic) => {
					const signer = new smplx.WalletSigner(mnemonic, network);

					try {
						return await assembleReviewedTransaction(review, {
							// A public key rather than a signer: hiding an output needs only the
							// blinding key of the address it pays to, and the assembler still holds
							// no credential of any kind.
							blindingPublicKeyHex: signer.blindingPublicKey(),
							// Where change goes is the wallet's own business and the review has no
							// say in it. Left unset the module returns change to whichever address
							// the signer happens to derive, which is a wallet decision made
							// somewhere the wallet cannot see.
							changeScriptPubKeyHex: signer.scriptPubKeyHex(),
							finalize: (builder, feeRateSatsPerKvb) => {
								// Narrowed back to the concrete handle. `AssemblingBuilder` is the
								// structural surface the assembler drives, which is what lets a
								// substitute stand in for the module in a test; the signer takes the
								// module's own class. Only this direction is a cast, and only because
								// a structural type cannot prove it is the very object the builder
								// constructor above made — which it is, since nothing else made one.
								const result = signer.finalizeTransaction(
									builder as InstanceType<typeof smplx.TransactionBuilder>,
									feeRateSatsPerKvb,
								);

								// Read out and released here rather than handed back as a handle: it is
								// wasm memory, and the only thing that knows when it is finished with
								// it is the call that made it.
								try {
									return { feeSats: result.feeSats, hex: result.hex, txid: result.txid };
								} finally {
									result.free();
								}
							},
							// The module's own constructor, handed over uncast. That is the point:
							// `AssemblingBuilder` states the methods this path calls, so assigning the
							// real constructor to it is the compile-time proof that the shipped module
							// has `addCovenantInput`, `addCovenantIssuanceInput`, `setLocktimeHeight`
							// and `setSequence` under those names and those arguments. A cast here
							// would suppress exactly the check the type exists for, and a wasm build
							// that had drifted from the pinned SDK would compile and fail at the call.
							smplx,
						});
					} finally {
						signer.free();
					}
				},
			);

			// A refusal from the assembler is not a thing a person can be asked about: by this
			// point the document has been read, the action resolved and the person has already
			// approved. What failed is the agreement between this wallet and the module underneath
			// it, and nothing is returned rather than a transaction with a note attached.
			if (!assembled.ok) {
				throw new WalletRpcInvalidParamsError(
					assembled.reason,
					{ reject: assembled.reject },
					WALLET_RPC_ERROR_REASONS.INVALID_MANIFEST_REQUEST,
				);
			}

			const { feeSats, hex, txid } = assembled.transaction;
			const signed = { feeSats: feeSats.toString(), transactionHex: hex, txid };
			// The deployment the action created, if it created one. Carried on both answers,
			// because the caller that has to record it is the one that asked for the action, and a
			// transaction it did not broadcast is still one it may broadcast itself.
			const deployment =
				review.createdInstance === undefined ? {} : { deployment: review.createdInstance.fields };

			if (!params.broadcast) {
				return { broadcast: false, ...deployment, ...signed };
			}

			// LWK's Esplora client needs a `window` the service worker does not have, so the
			// finished transaction crosses into the offscreen document to go out. Nothing else
			// crosses: it is already signed.
			const sent = await dependencies.broadcastTransaction({
				chain: account.chain,
				txHex: signed.transactionHex,
			});

			return { broadcast: true, ...deployment, ...signed, txid: sent.txid };
		},
		id: LIQUID_WALLET_RPC_METHODS.PROCESS_CONFIDENTIAL_TRANSACTION,
		parse: parseRequest,
		review: async ({ context, params }) => {
			const network = requireNetwork(context);
			const account = await dependencies.resolveAccount(context);
			const smplx = await dependencies.loadSmplx();

			await context.walletBackend.syncAccount(account);

			const result = await reviewManifestAction(params, {
				accountLabel: accountLabelOf(context, account),
				// One compiled contract, two spellings of where the covenant is, from the adapter that
				// owns that pairing: deriving them from separate compiles is how an output came to
				// be paid to a bech32 string, since the builder hex-decodes what it is given and an
				// address is not hex. Reached for rather than repeated, because a second wiring of
				// the same module is a second place the four build inputs can be dropped from.
				compile: createSmplxCovenantCompiler(smplx),
				// The version this wallet's shipped module compiles with, checked against the one a
				// protocol declares. One constant, guarded against the submodule it describes, so
				// the extension and the dapp's own inspector cannot answer the question differently.
				compilerVersion: SMPLX_COMPILER_VERSION,
				// The other half of the same compiler, asked before a contract is built rather than
				// after. A deployment wires most compile parameters to a name, which carries the
				// format's own declared type; some it writes as a bare value, and those have no type
				// at the position they are written. SimplicityHL declares one nowhere either, so the
				// compiler is the only thing that can say — and it can say it from the source alone.
				contractParamTypes: createSmplxContractParamTypes(smplx),
				// Both lists, because only one of them can pay for this and the other one is why a
				// person is short. Selection spends the explicit ones and reports the hidden ones as
				// held back, which is the difference between "you do not have enough" and "you have
				// enough and it is in the wrong shape".
				fundingUtxos: [
					...context.walletBackend.getExplicitUtxos(account, account.rawPolicyAssetId),
					...context.walletBackend.getUtxos(account, account.rawPolicyAssetId),
				],
				// The same two lists for any other asset the action turns out to move, asked for by
				// id. Which assets those are is not knowable here — it is settled inside the review,
				// after the document's lookups resolve — so this is a question the runtime asks
				// rather than an answer the wallet prepares.
				holdingsOf: (asset) => [
					...context.walletBackend.getExplicitUtxos(account, asset),
					...context.walletBackend.getUtxos(account, asset),
				],
				network,
				policyAsset: account.rawPolicyAssetId,
				// The wallet's own scan rather than an endpoint: it has just synced, and a plain
				// chain-tip route is not universal — the backend this wallet uses for Liquid testnet
				// answers 404 to it, which is how a locktime came to be declared as zero.
				readChainTip: async () => context.walletBackend.getTipHeight(account),
				readFeeRate: dependencies.readFeeRate(context.chain),
				readTxOut: dependencies.readTxOut(context.chain),
				// The same compiler again, for the covenant hashes a document works out for itself. A
				// hash of a contract built any differently is the hash of a different contract, and
				// a manifest stores that hash as a parameter of the covenant it then locks funds
				// into — so the same adapter answers both, and the network is bound rather than
				// asked for, because a script's bytes do not depend on one.
				scriptPubKeyOf: createSmplxScriptPubKeyCompiler(smplx, network),
				// The address this path can spend from rather than the one a person is shown for
				// receiving. They differ as addresses are used, and an output paid back to this
				// wallet at a rotating one is money the next action of the same protocol cannot
				// find: the signing module derives one key, at the first external address.
				walletScriptPubKeyHex: await dependencies.scriptPubKeyHexOf(
					context.walletBackend.getSigningAddress(account).address,
				),
			});

			if (isRefusal(result)) {
				throw new WalletRpcInvalidParamsError(
					result.reason,
					{ reject: result.reject },
					WALLET_RPC_ERROR_REASONS.INVALID_MANIFEST_REQUEST,
				);
			}

			return result;
		},
	});

export const processLiquidConfidentialTransaction = createProcessLiquidConfidentialTransaction();

/**
 * Turns the runtime's malformed-request answer into the wire error a caller sees.
 *
 * The runtime returns a value rather than throwing because it has no transport; this method has
 * one, and owns how a refusal reaches whoever asked.
 */
function parseRequest(params: unknown): ParsedLiquidProcessCtParams {
	const parsed = parseLiquidProcessCtParams(params);

	if (!parsed.ok) {
		throw new WalletRpcInvalidParamsError(
			parsed.malformed.message,
			parsed.malformed.details,
			WALLET_RPC_ERROR_REASONS.INVALID_MANIFEST_REQUEST,
		);
	}

	return parsed.request;
}

/**
 * How the wallet names the account that is acting, in the wallet's own terms.
 *
 * Shown because it is otherwise the one thing on that screen nobody stated: the wallet chose it
 * by choosing the outputs, and a person approving a contract action is entitled to know which of
 * their accounts is about to pay for it.
 */
function accountLabelOf(context: LiquidProcessCtContext, account: LiquidWalletAccount): string {
	return `${account.chain?.id ?? context.chain.id} account ${account.accountGroupIndex ?? 0}`;
}

function requireNetwork(context: LiquidProcessCtContext): string {
	const network = SMPLX_NETWORKS[context.chain.settings.network];

	if (!network) {
		throw new WalletRpcInvalidParamsError(
			`Contract actions are not supported on ${context.chain.settings.network}.`,
			undefined,
			WALLET_RPC_ERROR_REASONS.INVALID_MANIFEST_REQUEST,
		);
	}

	return network;
}
