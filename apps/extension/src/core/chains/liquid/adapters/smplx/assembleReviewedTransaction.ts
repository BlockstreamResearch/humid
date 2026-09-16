import type { ManifestReview, RejectToken, StaticWitness } from "@humid/tx-manifest";

import type { SmplxWasmModule } from "./loadSmplxWasm";

export type AssembledTransaction = {
	feeSats: bigint;
	hex: string;
	txid: string;
};

export type AssembledIssuanceReport = {
	assetId: string;
	entropy: string;
	free: () => void;
	reissuanceTokenId: string;
};

export type AssemblingBuilder = Pick<
	InstanceType<SmplxWasmModule["TransactionBuilder"]>,
	"addChange" | "addOutput" | "addWalletInput" | "free"
> & {
	addCovenantInput: (
		txid: string,
		vout: number,
		txOutHex: string,
		source: string,
		argumentsJson?: string,
		witnessJson?: string,
		signatureWitness?: string,
		extraLeavesJson?: string,
		includeDebugSymbols?: boolean,
	) => void;
	addCovenantIssuanceInput: (
		txid: string,
		vout: number,
		txOutHex: string,
		source: string,
		argumentsJson: string | undefined,
		witnessJson: string | undefined,
		signatureWitness: string | undefined,
		assetAmountSats: bigint,
		inflationAmountSats: bigint,
		issuerContractHex: string | undefined,
		extraLeavesJson?: string,
		includeDebugSymbols?: boolean,
	) => AssembledIssuanceReport;
	setLocktimeHeight: (height: number) => void;
	setSequence: (sequence: number) => void;
	addWalletIssuanceInput: (
		txid: string,
		vout: number,
		txOutHex: string,
		assetAmountSats: bigint,
		inflationAmountSats: bigint,
		issuerContractHex?: string,
	) => AssembledIssuanceReport;
};

export type FinalizeTransaction = (
	builder: AssemblingBuilder,
	feeRateSatsPerKvb: number,
) => AssembledTransaction | Promise<AssembledTransaction>;

export type AssembleResult =
	| { ok: false; reason: string; reject: RejectToken }
	| { ok: true; transaction: AssembledTransaction };

export async function assembleReviewedTransaction(
	review: ManifestReview,
	input: {
		blindingPublicKeyHex?: string;
		changeScriptPubKeyHex: string;
		finalize: FinalizeTransaction;
		smplx: { TransactionBuilder: new () => AssemblingBuilder };
	},
): Promise<AssembleResult> {
	if (review.inputOrder.length === 0) {
		return {
			ok: false,
			reason: `"${review.action}" has nothing funding it.`,
			reject: "shortfall",
		};
	}

	if (review.outputs.length === 0) {
		return {
			ok: false,
			reason: `"${review.action}" pays nothing, so there is nothing to build.`,
			reject: "document-fault",
		};
	}

	const unblindable = review.outputs.find((output) => output.blinded);

	if (unblindable && input.blindingPublicKeyHex === undefined) {
		return {
			ok: false,
			reason:
				`The output ${unblindable.id || "(unnamed)"} must hide what it carries, and no ` +
				"blinding key was supplied to hide it with.",
			reject: "unimplemented-construct",
		};
	}

	if (review.changeBlinded && input.blindingPublicKeyHex === undefined) {
		return {
			ok: false,
			reason: `"${review.action}" returns change that must hide what it carries, and no blinding key was supplied to hide it with.`,
			reject: "unimplemented-construct",
		};
	}

	const issuing = new Map<string, ManifestReview["issuances"][number]>();

	for (const issuance of review.issuances) {
		const key = outpointKey(issuance.outpoint);

		if (issuing.has(key)) {
			return {
				ok: false,
				reason:
					`Input ${issuance.inputId} issues an asset from ${issuance.outpoint.txid}:` +
					`${issuance.outpoint.vout}, which another input of this transaction already ` +
					"issues from. One output cannot create two assets.",
				reject: "document-fault",
			};
		}

		issuing.set(key, issuance);
	}

	const spending = new Set(
		review.inputOrder.map((planned) =>
			outpointKey(planned.source === "covenant" ? planned.covenant : planned.utxo),
		),
	);
	const stranded = review.issuances.find(
		(issuance) => !spending.has(outpointKey(issuance.outpoint)),
	);

	if (stranded) {
		return {
			ok: false,
			reason:
				`Input ${stranded.inputId} issues an asset from an output this transaction does not ` +
				"spend, so the asset would never exist.",
			reject: "document-fault",
		};
	}

	if (spending.size !== review.inputOrder.length) {
		return {
			ok: false,
			reason: `"${review.action}" spends one of its outputs more than once.`,
			reject: "document-fault",
		};
	}

	const builder = new input.smplx.TransactionBuilder();

	try {
		if (review.locktimeHeight !== undefined) {
			builder.setLocktimeHeight(review.locktimeHeight);
		}

		if (review.sequence !== undefined) {
			builder.setSequence(review.sequence);
		}

		const placed = new Set<string>();

		const disagreement = (
			issuance: ManifestReview["issuances"][number],
			reported: AssembledIssuanceReport,
		): AssembleResult | undefined => {
			try {
				const difference = firstDisagreement(issuance, reported);

				return difference === undefined
					? undefined
					: {
							ok: false,
							reason:
								`Input ${issuance.inputId} creates an asset the signing module does not ` +
								`agree about: the ${difference.what} the wallet derived is ${difference.mine} ` +
								`and the module reports ${difference.theirs}.`,
							reject: "built-something-else",
						};
			} finally {
				reported.free();
			}
		};

		for (const planned of review.inputOrder) {
			const key =
				planned.source === "covenant" ? outpointKey(planned.covenant) : outpointKey(planned.utxo);
			const issuance = issuing.get(key);

			if (issuance) {
				placed.add(key);
			}

			if (planned.source === "covenant") {
				const { covenant } = planned;
				const witness = witnessValuesJson(covenant.witnessValues);

				if (!issuance) {
					builder.addCovenantInput(
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

					continue;
				}

				const refusal = disagreement(
					issuance,
					builder.addCovenantIssuanceInput(
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

				if (refusal) {
					return refusal;
				}

				continue;
			}

			const { utxo } = planned;

			if (!issuance) {
				builder.addWalletInput(utxo.txid, utxo.vout, utxo.txOut);

				continue;
			}

			const refusal = disagreement(
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

			if (refusal) {
				return refusal;
			}
		}

		const missed = review.issuances.find((issuance) => !placed.has(outpointKey(issuance.outpoint)));

		if (missed) {
			return {
				ok: false,
				reason:
					`Input ${missed.inputId} issues an asset from an output this transaction does not ` +
					"spend, so the asset would never exist.",
				reject: "document-fault",
			};
		}

		for (const output of review.outputs) {
			builder.addOutput(
				output.scriptPubKeyHex,
				output.sats,
				output.asset,
				output.blinded ? input.blindingPublicKeyHex : undefined,
			);
		}

		builder.addChange(
			input.changeScriptPubKeyHex,
			review.changeBlinded ? input.blindingPublicKeyHex : undefined,
		);

		const transaction = await input.finalize(builder, review.feeRateSatsPerKvb);

		return { ok: true, transaction };
	} catch (error) {
		return {
			ok: false,
			reason: `This transaction could not be assembled: ${String(error)}`,
			reject: "built-something-else",
		};
	} finally {
		builder.free();
	}
}

function witnessValuesJson(values: StaticWitness[] | undefined): string | undefined {
	if (!values || values.length === 0) {
		return undefined;
	}

	return JSON.stringify(
		Object.fromEntries(
			values.map(({ name, simplicityType, value }) => [name, { type: simplicityType, value }]),
		),
	);
}

function firstDisagreement(
	mine: ManifestReview["issuances"][number],
	theirs: Omit<AssembledIssuanceReport, "free">,
): { mine: string; theirs: string; what: string } | undefined {
	const compared = [
		{ mine: mine.asset, theirs: theirs.assetId, what: "asset" },
		{ mine: mine.entropy, theirs: theirs.entropy, what: "entropy" },
		{ mine: mine.reissuanceToken, theirs: theirs.reissuanceTokenId, what: "reissuance token" },
	];

	return compared.find((field) => field.mine.toLowerCase() !== field.theirs.toLowerCase());
}

function outpointKey(outpoint: { txid: string; vout: number }): string {
	return `${outpoint.txid.trim().toLowerCase()}:${outpoint.vout}`;
}
