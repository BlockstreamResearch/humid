import { SMPLX_COMPILER_VERSION } from "@humid/smplx-compiler";
import {
	createEsploraFeeRateReader,
	createEsploraTxOutReader,
	guardBlindedOutputs,
	guardSpentInputs,
	isRefusal,
	type ManifestReview,
	type ParsedLiquidProcessCtParams,
	parseLiquidProcessCtParams,
	type ReadFeeRate,
	type ReadTxOut,
	type RejectToken,
	reviewManifestAction,
	toShownConfirmation,
} from "@humid/tx-manifest";

import type { KeyManagerState, UpdateKeyManagerState } from "@/core/key-manager/types";
import { logger } from "@/core/logger";
import { createWalletMethod } from "@/core/wallet-methods/createWalletMethod";
import { WALLET_RPC_ERROR_REASONS, WalletRpcInvalidParamsError } from "@/core/wallet-rpc/errors";
import type { WalletRpcBaseContext } from "@/core/wallet-rpc/types";

import { toScriptPubKeyHex } from "../../../adapters/lwk/wallet/toScriptPubKeyHex";
import { withAccountMnemonic } from "../../../adapters/lwk/wallet/withAccountMnemonic";
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
	/**
	 * The deployment this action brought into existence, when it created one.
	 *
	 * Absent for every action that only spends what already exists. Returned rather than left
	 * for the caller to work out again, because half of these fields are functions of outputs
	 * the wallet chose — an asset id is derived from the output its issuing input spends — and
	 * a caller reconstructing them afterwards would be guessing which output that was. The
	 * deployment outlives the transaction; the transaction is where it can still be read.
	 */
	deployment?: Record<string, string>;
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

			/*
			 * What the signing module is about to be told about each covenant, beside what the
			 * review established about the same covenant from the chain.
			 *
			 * Written at warn so it survives a production build, because this is the seam where the
			 * two compiles can disagree and the disagreement only shows up as an execution failure
			 * after a person has approved. `covenantBuild` is the marker for which build is loaded:
			 * an extension without it in the log is an older copy, whatever the files on disk say.
			 */
			logger.warn("covenantBuild", {
				action: review.action,
				covenants: review.covenants.map((found) => ({
					address: found.address,
					role: found.role,
					utxoType: found.utxoType,
					verified: found.verified,
				})),
				inputs: review.covenantInputs.map((covenant) => ({
					argumentsJson: covenant.argumentsJson,
					extraLeavesJson: covenant.extraLeavesJson,
					id: covenant.id,
					includeDebugSymbols: covenant.includeDebugSymbols,
					sourceBytes: covenant.source.length,
					txid: covenant.txid,
					vout: covenant.vout,
				})),
			});
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

					// A covenant branch guarded by a lock height reads the transaction's own
					// locktime, and one that declares none satisfies no such branch. The review
					// answers with where the chain is — the same thing every wallet writes there,
					// and nothing about any protocol. Skipped where it read nothing, because an
					// action whose covenants are not time-locked does not need one.
					if (review.locktimeHeight !== undefined) {
						builder.setLocktimeHeight(review.locktimeHeight);
					}

					// One sequence for the transaction, because that is what the module takes: it
					// writes this onto every input that declares none. The review has already
					// collapsed what the action declares into the single value this can be, or
					// refused the action. Skipped where nothing was declared, which leaves every
					// input at the module's own default.
					if (review.sequence !== undefined) {
						builder.setSequence(review.sequence);
					}

					try {
						// Which inputs create an asset, keyed by the output each one is derived
						// from. That outpoint is the only join both sides promise: the manifest
						// named the input, the wallet chose the output, and an asset id is a
						// function of the output rather than of where the input ended up. Matching
						// on order would be matching on something neither side states.
						const issuing = new Map(
							review.issuances.map((issuance) => [
								outpointKey(issuance.outpoint.txid, issuance.outpoint.vout),
								issuance,
							]),
						);
						const placed = new Set<string>();

						// The module derives the asset for itself, from the same output, and reports
						// what it made of it. This is the first fact the wallet and the module each
						// establish independently, so it gets the treatment every other such fact
						// gets: they are compared, and a difference refuses rather than one of the
						// two being trusted. A silent disagreement means one of them is creating a
						// different asset than the other, and nothing downstream could tell which.
						const agreeOrRefuse = (
							issuance: (typeof review.issuances)[number],
							reported: {
								assetId: string;
								entropy: string;
								free: () => void;
								reissuanceTokenId: string;
							},
						) => {
							try {
								const difference = firstDisagreement(issuance, reported);

								if (difference) {
									throw new WalletRpcInvalidParamsError(
										`Input ${issuance.inputId} creates an asset the signing module ` +
											`does not agree about: the ${difference.what} the wallet derived ` +
											`is ${difference.mine} and the module reports ${difference.theirs}.`,
										{ reject: "built-something-else" satisfies RejectToken },
										WALLET_RPC_ERROR_REASONS.INVALID_MANIFEST_REQUEST,
									);
								}
							} finally {
								reported.free();
							}
						};

						// In the order the review worked out, which is the document's wherever it
						// states one. Every covenant used to be added first and the wallet's own
						// after, which is one order among many: a covenant introspects positions,
						// and a document stating one for an input the wallet supplies is saying
						// that that order builds a transaction its contract will not run against.
						for (const planned of review.inputOrder) {
							const key =
								planned.source === "covenant"
									? outpointKey(planned.covenant.txid, planned.covenant.vout)
									: outpointKey(planned.utxo.txid, planned.utxo.vout);
							const issuance = issuing.get(key);

							if (issuance) {
								placed.add(key);
							}

							if (planned.source === "covenant") {
								const { covenant } = planned;
								// The values the document states outright, which is how a covenant
								// with more than one branch is told which to run. A signature is not
								// among them: only the signer can make one, and naming it below is
								// what asks for one. Passed as the compiler's own witness shape — a
								// type and a literal, both text — because the compiler is what
								// parses SimplicityHL.
								const witness = witnessValuesJson(covenant.witnessValues);

								if (issuance) {
									logger.warn("covenantBuild:issue", {
										id: covenant.id,
										includeDebugSymbols: covenant.includeDebugSymbols,
										leaves: covenant.extraLeavesJson,
									});

									// The issuer contract is left unstated because a manifest declares
									// none at any position, so both sides commit to nothing and each
									// says so.
									agreeOrRefuse(
										issuance,
										builder.addContractIssuanceInput(
											covenant.txid,
											covenant.vout,
											covenant.txOutHex,
											covenant.source,
											covenant.argumentsJson,
											witness,
											covenant.signatureWitness,
											issuance.assetAmountSats,
											issuance.inflationAmountSats,
											undefined,
											covenant.extraLeavesJson,
											covenant.includeDebugSymbols,
										),
									);
								} else {
									// The leaves and the mode go with the source and the parameters, because all
									// four decide the script the covenant locks to. Sending the first two alone
									// builds a different contract than the one the review checked against the
									// chain, and the covenant refuses its own spend at execution.
									logger.warn("covenantBuild:spend", {
										id: covenant.id,
										includeDebugSymbols: covenant.includeDebugSymbols,
										leaves: covenant.extraLeavesJson,
									});
									builder.addContractInput(
										covenant.txid,
										covenant.vout,
										covenant.txOutHex,
										covenant.source,
										covenant.argumentsJson,
										witness,
										covenant.signatureWitness,
										covenant.extraLeavesJson,
										covenant.includeDebugSymbols,
									);
								}

								continue;
							}

							const { utxo } = planned;

							if (issuance) {
								agreeOrRefuse(
									issuance,
									builder.addWalletIssuanceInput(
										utxo.txid,
										utxo.vout,
										utxo.txOut,
										issuance.assetAmountSats,
										issuance.inflationAmountSats,
										undefined,
									),
								);
							} else {
								builder.addWalletInput(utxo.txid, utxo.vout, utxo.txOut);
							}
						}

						// An asset derived from an output no input spends is an id for something
						// that would never exist, and the person would have been shown it. This
						// cannot happen while the outputs an issuance is derived from are the ones
						// reserved out of the funding pool, which is why it is an assertion about
						// this path rather than a refusal a document can provoke.
						const stranded = review.issuances.find(
							(issuance) =>
								!placed.has(outpointKey(issuance.outpoint.txid, issuance.outpoint.vout)),
						);

						if (stranded) {
							throw new WalletRpcInvalidParamsError(
								`Input ${stranded.inputId} issues an asset from an output this ` +
									"transaction does not spend, so the asset would never exist.",
								{ reject: "built-something-else" satisfies RejectToken },
								WALLET_RPC_ERROR_REASONS.INVALID_MANIFEST_REQUEST,
							);
						}

						// An output the document wants hidden is hidden with this wallet's own blinding
						// key. Which outputs those are was decided while reading the document, not
						// here: the builder has never read it, and an output built the wrong way is
						// one whose amount is published when the protocol meant it kept.
						for (const output of review.outputs) {
							// Paid in the asset the review worked out for it, which is not always this
							// account's policy asset and used to be assumed to be. An output carrying a
							// protocol's own token, built in the network's asset instead, pays real
							// money to a covenant expecting a token — and nothing downstream of here
							// could tell.
							builder.addOutput(
								output.scriptPubKeyHex,
								output.sats,
								output.asset,
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

			// And what came back hides exactly what the document decided to hide. Handing the
			// builder a blinding key is a request, not a result: whether it was applied is only
			// visible in the bytes, where a hidden amount is a commitment and an open one is a
			// number. Both directions are checked, because both are silent — an amount published
			// that the protocol meant kept cannot be taken back, and an amount hidden on an
			// output a covenant will later read is money nothing can spend.
			const built = guardBlindedOutputs(signed.transactionHex, {
				changeBlinded: review.changeBlinded,
				outputs: review.outputs.map(({ blinded, id }) => ({ blinded, id })),
			});

			if (!built.ok) {
				throw new WalletRpcInvalidParamsError(
					built.reason,
					{ reject: "built-something-else" satisfies RejectToken },
					WALLET_RPC_ERROR_REASONS.INVALID_MANIFEST_REQUEST,
				);
			}

			// The deployment the action created, if it created one. Carried on both answers,
			// because the caller that has to record it is the one that asked for the action and
			// a transaction it did not broadcast is still one it may broadcast itself.
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
				// The other half of the same compiler, asked before a contract is built rather than
				// after. A deployment wires most compile parameters to a name, which carries the
				// format's own declared type; some it writes as a bare value, and those have no type
				// at the position they are written. SimplicityHL declares one nowhere either — a
				// parameter takes the type of the position it is used at, worked out by the type
				// checker — so the compiler is the only thing that can say, and it can say it from
				// the source alone, before there are any arguments to build.
				contractParamTypes: (source) => JSON.parse(smplx.contractParameterTypes(source)),
				compilerVersion: SMPLX_COMPILER_VERSION,
				policyAsset: account.rawPolicyAssetId,
				// The same compiler again, for the covenant hashes a document works out for itself.
				// Everything a full compile is given, because a hash of a contract built any
				// differently is the hash of a different contract — and a manifest stores that hash
				// as a parameter of the covenant it then locks funds into. The leaves and the
				// declared build mode were both absent here, so the hash was of a contract with an
				// empty taproot tree built in whichever mode the module defaults to.
				scriptPubKeyOf: ({ argumentsJson, extraLeavesJson, includeDebugSymbols, source }) => {
					const contract = new smplx.Contract(
						source,
						argumentsJson,
						extraLeavesJson,
						includeDebugSymbols,
					);

					try {
						return contract.scriptPubKeyHex(network);
					} finally {
						contract.free();
					}
				},
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
				// after the document's lookups resolve against the deployment — so this is a
				// question the runtime asks rather than an answer the wallet prepares.
				holdingsOf: (asset) => [
					...context.walletBackend.getExplicitUtxos(account, asset),
					...context.walletBackend.getUtxos(account, asset),
				],
				network,
				accountLabel: `${account.chain?.id ?? context.chain.id} account ${account.accountGroupIndex}`,
				// The wallet's own scan rather than an endpoint: it has just synced, and a plain
				// chain-tip route is not universal — the backend this wallet uses for Liquid
				// testnet answers 404 to it, which is how a locktime came to be declared as zero.
				readChainTip: async () => context.walletBackend.getTipHeight(account),
				readFeeRate: dependencies.readFeeRate(context.chain),
				readTxOut: dependencies.readTxOut(context.chain),
				// The address this path can spend from rather than the one a person is shown for
				// receiving. They differ as addresses are used, and an output paid back to this
				// wallet at a rotating one is money the next action of the same protocol cannot
				// find: the signing module derives one key, at the first external address.
				walletScriptPubKeyHex: await dependencies.scriptPubKeyHexOf(
					context.walletBackend.getSigningAddress(account).address,
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

/** One output, written the same way on both sides of a comparison. */
function outpointKey(txid: string, vout: number): string {
	return `${txid}:${vout}`;
}

/**
 * What the module says it issued, against what the wallet derived, in one comparison.
 *
 * All three values, because two of them agreeing while the third does not is still a
 * disagreement about what is being created. Both sides are lowered before they are compared:
 * normalising one side only is a comparison that can pass while the values differ.
 */
function firstDisagreement(
	planned: { asset: string; entropy: string; reissuanceToken: string },
	reported: { assetId: string; entropy: string; reissuanceTokenId: string },
): { mine: string; theirs: string; what: string } | undefined {
	const compared = [
		{ mine: planned.asset, theirs: reported.assetId, what: "asset" },
		{ mine: planned.reissuanceToken, theirs: reported.reissuanceTokenId, what: "reissuance token" },
		{ mine: planned.entropy, theirs: reported.entropy, what: "entropy" },
	];

	return compared.find(({ mine, theirs }) => mine.toLowerCase() !== theirs.toLowerCase());
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
