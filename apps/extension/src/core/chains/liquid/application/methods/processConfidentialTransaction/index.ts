import {
	createEsploraFeeRateReader,
	createEsploraTxOutReader,
	guardSpentInputs,
	isRefusal,
	type ManifestReview,
	type ParsedLiquidProcessCtParams,
	parseLiquidProcessCtParams,
	type ReadFeeRate,
	type ReadTxOut,
	reviewManifestAction,
	toShownConfirmation,
} from "@humid/tx-manifest";

import type { KeyManagerState, UpdateKeyManagerState } from "@/core/key-manager/types";
import { createWalletMethod } from "@/core/wallet-methods/createWalletMethod";
import { WALLET_RPC_ERROR_REASONS, WalletRpcInvalidParamsError } from "@/core/wallet-rpc/errors";
import type { WalletRpcBaseContext } from "@/core/wallet-rpc/types";

import { toScriptPubKeyHex } from "../../../adapters/lwk/wallet/toScriptPubKeyHex";
import { withAccountMnemonic } from "../../../adapters/lwk/wallet/withAccountMnemonic";
import { SMPLX_COMPILER_VERSION } from "../../../adapters/smplx/compilerVersion";
import { loadSmplxWasm } from "../../../adapters/smplx/loadSmplxWasm";
import type { LiquidChainRecord } from "../../../chains/LiquidChainRecord";
import { LIQUID_WALLET_RPC_METHODS } from "../../../domain/LiquidRpc";
import type { LiquidWalletBackend } from "../../backends/LiquidWalletBackend";
import { resolveDappAccount } from "../../dappAccountScope";
import { PROCESS_CT_CONFIRMATION_KIND } from "./ProcessCtConfirmation";

export type LiquidProcessCtContext = WalletRpcBaseContext & {
	chain: LiquidChainRecord;
	keyManagerState: KeyManagerState;
	updateKeyManagerState?: UpdateKeyManagerState;
	walletBackend: LiquidWalletBackend;
};

export type LiquidProcessCtResult = {
	broadcast: boolean;
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
 * Performs one action of a txManifest protocol. The site sends the manifest, the sources
 * of the contracts it references, the chosen action and its filled parameters; everything
 * else happens inside the extension.
 *
 * The wallet establishes for itself that each contract is the one the site describes: it
 * rebuilds every covenant from source, and for one being spent compares the derived
 * address against what the chain says is at that outpoint. A mismatch refuses, and there
 * is no way to click through it.
 *
 * That check lives in `review` deliberately. `review` runs before the permission gate, so
 * a standing permission — which skips the prompt entirely — cannot skip the verification
 * with it.
 */
/**
 * Everything the method reaches outside itself.
 *
 * Named as one object so the whole seam — parse, verify, plan, sign, broadcast — can be
 * driven in a test. Without this the only way to exercise the method is to build the
 * extension and run it, which is why nothing did.
 */
export type LiquidProcessCtDependencies = {
	broadcastTransaction: (input: {
		chain: LiquidChainRecord;
		txHex: string;
	}) => Promise<{ txid: string }>;
	loadSmplx: typeof loadSmplxWasm;
	readFeeRate: (chain: LiquidChainRecord) => ReadFeeRate;
	readTxOut: (chain: LiquidChainRecord) => ReadTxOut;
	resolveAccount: typeof resolveDappAccount;
	scriptPubKeyHexOf: (address: string) => Promise<string>;
	withMnemonic: typeof withAccountMnemonic;
};

/**
 * The witness values one covenant input needs, in the shape the signing module takes.
 *
 * A type and a literal, both text, keyed by the name the contract declares. The wallet does
 * not parse either: the compiler that will type-check the literal is the authority on what it
 * means, and a wallet reading `Right(Left(()))` for itself would be a second opinion about
 * which branch of a contract runs.
 */
function witnessValuesJson(
	values: { name: string; simplicityType: string; value: string }[] | undefined,
): string | undefined {
	if (!values || values.length === 0) {
		return undefined;
	}

	return JSON.stringify(
		Object.fromEntries(
			values.map(({ name, simplicityType, value }) => [name, { type: simplicityType, value }]),
		),
	);
}

/** How the method is wired in the extension. Tests substitute what they need. */
export const liquidProcessCtDependencies: LiquidProcessCtDependencies = {
	// Imported when a transaction is actually broadcast rather than at module load: the
	// sync-worker client reaches for `webextension-polyfill`, which throws outside an
	// extension, and nothing else in this method needs a browser.
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
 * Turns the runtime's malformed-request answer into the wire error a caller sees.
 *
 * The runtime returns a value rather than throwing because it has no transport; this
 * method has one, and owns how a refusal reaches whoever asked.
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
				broadcast: params.broadcast,
				kind: PROCESS_CT_CONFIRMATION_KIND,
				// The whole model the person is shown, amounts as strings: this crosses the
				// message bus, which serializes as JSON, and JSON.stringify throws on a bigint
				// rather than rounding it. Every covenant the wallet rebuilt is inside it, with
				// what it established about each — `not-yet-on-chain` marks one being created,
				// which there is nothing to compare against and is a different fact rather than
				// a weaker form of verified.
				shown: toShownConfirmation(review.confirmation),
			},
			message: `A site wants to perform "${review.action}" on the ${review.protocol} protocol.`,
			title: "Perform a contract action?",
		}),
		execute: async ({ context, params, review }) => {
			const network = requireNetwork(context);
			const account = await dependencies.resolveAccount(context);
			const smplx = await dependencies.loadSmplx();

			// Everything except signing was settled in `review`, before the person was asked.
			// What gets signed here is the transaction they were shown, not one reassembled
			// afterwards from the same inputs.
			const signed = await dependencies.withMnemonic(
				{
					accountGroupIndex: account.accountGroupIndex,
					chain: context.chain,
					keyManagerState: context.keyManagerState,
				},
				(mnemonic) => {
					const signer = new smplx.WalletSigner(mnemonic, network);
					const builder = new smplx.TransactionBuilder();

					try {
						// Covenant inputs first: the manifest's own input order is what a covenant
						// introspects, and wallet inputs are the wallet's addition to it.
						for (const covenant of review.covenantInputs) {
							builder.addContractInput(
								covenant.txid,
								covenant.vout,
								covenant.txOutHex,
								covenant.source,
								covenant.argumentsJson,
								// The values the document states outright, which is how a covenant with
								// more than one branch is told which to run. A signature is not among
								// them: only the signer can make one, and naming it below is what asks
								// for one. Passed as the compiler's own witness shape — a type and a
								// literal, both text — because the compiler is what parses SimplicityHL.
								witnessValuesJson(covenant.witnessValues),
								covenant.signatureWitness,
								sequenceFor(review, covenant.id),
							);
						}

						for (const utxo of review.selected) {
							builder.addWalletInput(utxo.txid, utxo.vout, utxo.txOut);
						}

						// An output the document wants hidden is hidden with this wallet's own blinding
						// key. Which outputs those are was decided while reading the document, not
						// here: the builder has never read it, and an output built the wrong way is
						// one whose amount is published when the protocol meant it kept.
						for (const output of review.outputs) {
							builder.addOutput(
								output.scriptPubKeyHex,
								output.sats,
								account.rawPolicyAssetId,
								output.blinded ? signer.blindingPublicKey() : undefined,
							);
						}

						// Where change goes is a fact about this transaction, so it is set on the
						// builder rather than passed to the call that signs it. Unset, the module
						// returns change to the signer's own derived address, which this wallet does
						// watch today but only because the signing path is limited to one index.
						builder.addChange(
							signer.scriptPubKeyHex(),
							review.changeBlinded ? signer.blindingPublicKey() : undefined,
						);

						const result = signer.finalizeTransaction(builder, review.feeRateSatsPerKvb);
						const extracted = {
							feeSats: result.feeSats.toString(),
							transactionHex: result.hex,
							txid: result.txid,
						};

						result.free();

						return extracted;
					} finally {
						builder.free();
						signer.free();
					}
				},
			);

			// What came back spends only what the action required and the wallet chose, or
			// nothing is returned at all. The guard reads the transaction's own bytes rather
			// than asking the module, because a module's account of itself cannot answer
			// whether it did something it was not asked to.
			const guarded = guardSpentInputs(signed.transactionHex, {
				covenantInputs: review.covenantInputs.map(({ txid, vout }) => ({ txid, vout })),
				walletInputs: review.selected.map(({ txid, vout }) => ({ txid, vout })),
			});

			if (!guarded.ok) {
				throw new WalletRpcInvalidParamsError(
					guarded.reason,
					undefined,
					WALLET_RPC_ERROR_REASONS.INVALID_MANIFEST_REQUEST,
				);
			}

			if (!params.broadcast) {
				return { broadcast: false, ...signed };
			}

			// LWK's Esplora client needs a `window` the service worker does not have, so the
			// finished transaction crosses into the offscreen document to go out. Nothing else
			// crosses: it is already signed.
			const sent = await dependencies.broadcastTransaction({
				chain: account.chain,
				txHex: signed.transactionHex,
			});

			return { broadcast: true, ...signed, txid: sent.txid };
		},
		id: LIQUID_WALLET_RPC_METHODS.PROCESS_CONFIDENTIAL_TRANSACTION,
		parse: parseRequest,
		review: async ({ context, params }) => {
			const network = requireNetwork(context);
			const account = await dependencies.resolveAccount(context);
			const smplx = await dependencies.loadSmplx();

			await context.walletBackend.syncAccount(account);

			const result = await reviewManifestAction(params, {
				// One compiled contract, two spellings of where the covenant is. Deriving them
				// from separate compiles is how an output came to be paid to a bech32 string:
				// the builder hex-decodes what it is given, and an address is not hex.
				compile: ({
					argumentsJson,
					extraLeavesJson,
					includeDebugSymbols,
					network: target,
					source,
				}) => {
					const contract = new smplx.Contract(
						source,
						argumentsJson,
						extraLeavesJson,
						includeDebugSymbols,
					);

					try {
						return {
							address: contract.contractAddress(target),
							scriptPubKeyHex: contract.scriptPubKeyHex(target),
						};
					} finally {
						contract.free();
					}
				},
				compilerVersion: SMPLX_COMPILER_VERSION,
				policyAsset: account.rawPolicyAssetId,
				scriptPubKeyOf: ({ argumentsJson, source }) =>
					new smplx.Contract(source, argumentsJson).scriptPubKeyHex(network),
				// Both lists, because only one of them can pay for this and the other one is why a
				// person is short. Selection spends the explicit ones and reports the hidden ones as
				// held back, which is the difference between "you do not have enough" and "you have
				// enough and it is in the wrong shape".
				fundingUtxos: [
					...context.walletBackend.getExplicitUtxos(account, account.rawPolicyAssetId),
					...context.walletBackend.getUtxos(account, account.rawPolicyAssetId),
				],
				network,
				accountLabel: `${account.chain?.id ?? context.chain.id} account ${account.accountGroupIndex}`,
				readFeeRate: dependencies.readFeeRate(context.chain),
				readTxOut: dependencies.readTxOut(context.chain),
				walletScriptPubKeyHex: await dependencies.scriptPubKeyHexOf(
					context.walletBackend.getReceiveAddress(account).address,
				),
			});

			if (isRefusal(result)) {
				// The sentence is for a person; the token beside it is for the site. Every refusal
				// on this path shares one wire code, so without the token a caller telling "this
				// wallet will never build that" from "your state file is out of date" has to parse
				// English — and one of those is worth retrying while the other never is.
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
 * The relative timelock this covenant input must carry, when its action declared one.
 *
 * A covenant can require the timelock rather than merely permit it, and the chain rejects a
 * transaction built without one — so a declaration dropped here fails on broadcast, far from
 * anything that explains it.
 */
function sequenceFor(review: ManifestReview, id: string): number | undefined {
	return review.inputRules.find((rule) => rule.id === id)?.sequence;
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
