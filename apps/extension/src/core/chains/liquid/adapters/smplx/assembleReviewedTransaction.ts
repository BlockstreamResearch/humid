import type { ManifestReview, RejectToken, StaticWitness } from "@humid/tx-manifest";

import type { SmplxWasmModule } from "./loadSmplxWasm";

export type AssembledTransaction = {
	feeSats: bigint;
	hex: string;
	txid: string;
};

export type AssembledIssuanceReport = {
	assetId: string;
	assetEntropy: string;
	free: () => void;
	inflationAssetId: string;
};

export type AssemblingBuilder = Pick<
	InstanceType<SmplxWasmModule["TransactionBuilder"]>,
	"addChange" | "addOutput" | "addInput" | "free"
> & {
	addProgramInput: (
		txid: string,
		vout: number,
		txOutHex: string,
		source: string,
		argumentsJson?: string,
		witnessJson?: string,
		programSignature?: string,
		extraLeavesJson?: string,
		includeDebugSymbols?: boolean,
		derivationPath?: string,
	) => void;
	addProgramIssuanceInput: (
		txid: string,
		vout: number,
		txOutHex: string,
		source: string,
		argumentsJson: string | undefined,
		witnessJson: string | undefined,
		programSignature: string | undefined,
		assetAmountSats: bigint,
		inflationAmountSats: bigint,
		issuerContractHex: string | undefined,
		extraLeavesJson?: string,
		includeDebugSymbols?: boolean,
		derivationPath?: string,
	) => AssembledIssuanceReport;
	setLocktimeHeight: (height: number) => void;
	setSequence: (sequence: number) => void;
	addIssuanceInput: (
		txid: string,
		vout: number,
		txOutHex: string,
		assetAmountSats: bigint,
		inflationAmountSats: bigint,
		issuerContractHex?: string,
		blindingSecretsJson?: string,
		derivationPath?: string,
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
		signingDerivationPath: string;
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

	// Policy-asset change is paid by `builder.addChange()` below, not through `outputs`.
	if (review.outputs.length === 0 && !review.changeDeferred) {
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
			outpointKey(planned.source === "program" ? planned.program : planned.utxo),
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

		for (const planned of review.inputOrder) {
			const key =
				planned.source === "program" ? outpointKey(planned.program) : outpointKey(planned.utxo);
			const issuance = issuing.get(key);

			if (issuance) {
				placed.add(key);
			}

			if (planned.source === "program") {
				const { program } = planned;
				const witness = witnessValuesJson(program.witnessValues);

				if (!issuance) {
					builder.addProgramInput(
						program.txid,
						program.vout,
						program.txOutHex,
						program.source,
						program.argumentsJson,
						witness,
						program.signatureWitness,
						program.extraLeavesJson,
						program.includeDebugSymbols,
						input.signingDerivationPath,
					);

					continue;
				}

				builder
					.addProgramIssuanceInput(
						program.txid,
						program.vout,
						program.txOutHex,
						program.source,
						program.argumentsJson,
						witness,
						program.signatureWitness,
						issuance.assetAmountSats,
						issuance.inflationAmountSats,
						undefined,
						program.extraLeavesJson,
						program.includeDebugSymbols,
						input.signingDerivationPath,
					)
					.free();

				continue;
			}

			const { utxo } = planned;
			const unsignable = refuseUnsignable(utxo);

			if (unsignable) {
				return unsignable;
			}

			if (!issuance) {
				builder.addInput(
					utxo.txid,
					utxo.vout,
					utxo.txOut,
					utxo.blindingSecretsJson,
					utxo.derivationPath,
				);

				continue;
			}

			builder
				.addIssuanceInput(
					utxo.txid,
					utxo.vout,
					utxo.txOut,
					issuance.assetAmountSats,
					issuance.inflationAmountSats,
					undefined,
					utxo.blindingSecretsJson,
					utxo.derivationPath,
				)
				.free();
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

function refuseUnsignable(utxo: ManifestReview["selected"][number]): AssembleResult | undefined {
	const at = `${utxo.txid}:${utxo.vout}`;

	if (!utxo.confidential) {
		return undefined;
	}

	if (utxo.blindingSecretsJson === undefined) {
		return {
			ok: false,
			reason: `This wallet holds ${at} blinded but did not say what it unblinds to, so it cannot be spent.`,
			reject: "built-something-else",
		};
	}

	if (utxo.derivationPath === undefined) {
		return {
			ok: false,
			reason: `This wallet did not say which key spends ${at}, so it cannot be signed.`,
			reject: "built-something-else",
		};
	}

	return undefined;
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

function outpointKey(outpoint: { txid: string; vout: number }): string {
	return `${outpoint.txid.trim().toLowerCase()}:${outpoint.vout}`;
}
