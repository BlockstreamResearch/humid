import {
	type ManifestReview,
	Refusal,
	type StaticWitness,
	type TransactionDraft,
} from "@humid/tx-manifest";

import type { SmplxWasmModule } from "./loadSmplxWasm";

export type AssembledIssuanceReport = {
	assetId: string;
	assetEntropy: string;
	free: () => void;
	inflationAssetId: string;
};

export type AssemblingBuilder = Pick<
	InstanceType<SmplxWasmModule["TransactionBuilder"]>,
	"addOutput" | "addInput" | "free"
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
	setInputSequence: (inputIndex: number, sequence: number) => void;
	setUnusedWitnesses: (inputIndex: number, names: string[]) => void;
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
	addReissuanceInput: (
		txid: string,
		vout: number,
		txOutHex: string,
		assetAmountSats: bigint,
		assetEntropy: string,
		blindingSecretsJson: string,
		derivationPath?: string,
	) => AssembledIssuanceReport;
};

export function assembleReviewedTransaction<Builder extends AssemblingBuilder, Finished>(
	draft: TransactionDraft,
	input: {
		blindingPublicKeyHex: string;
		signingDerivationPath: string;
		smplx: { TransactionBuilder: new () => Builder };
	},
	finish: (builder: Builder) => Finished,
): Finished {
	if (draft.inputOrder.length === 0) {
		throw new Refusal(`"${draft.action}" has nothing funding it.`, "shortfall");
	}

	if (draft.outputs.length === 0) {
		throw new Refusal(`"${draft.action}" pays nothing, so there is nothing to build.`);
	}

	const issuing = new Map<string, TransactionDraft["issuances"][number]>();

	for (const issuance of draft.issuances) {
		const key = outpointKey(issuance.outpoint);

		if (issuing.has(key)) {
			throw new Refusal(
				`Input ${issuance.inputId} issues an asset from ${issuance.outpoint.txid}:` +
					`${issuance.outpoint.vout}, which another input of this transaction already ` +
					"issues from. One output cannot create two assets.",
			);
		}

		issuing.set(key, issuance);
	}

	const spending = new Set(
		draft.inputOrder.map((planned) =>
			outpointKey(planned.source === "program" ? planned.program : planned.utxo),
		),
	);
	const stranded = draft.issuances.find(
		(issuance) => !spending.has(outpointKey(issuance.outpoint)),
	);

	if (stranded) {
		throw new Refusal(
			`Input ${stranded.inputId} issues an asset from an output this transaction does not ` +
				"spend, so the asset would never exist.",
		);
	}

	if (spending.size !== draft.inputOrder.length) {
		throw new Refusal(`"${draft.action}" spends one of its outputs more than once.`);
	}

	const builder = new input.smplx.TransactionBuilder();

	try {
		if (draft.locktimeHeight !== undefined) {
			builder.setLocktimeHeight(draft.locktimeHeight);
		}

		const placed = new Set<string>();

		for (const [index, planned] of draft.inputOrder.entries()) {
			const key =
				planned.source === "program" ? outpointKey(planned.program) : outpointKey(planned.utxo);
			const issuance = issuing.get(key);

			if (issuance) {
				placed.add(key);
			}

			if (planned.source === "program") {
				const { program } = planned;
				const witness = witnessValuesJson(program.witnessValues);

				if (issuance) {
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
				} else {
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
				}

				if (program.unusedWitnesses) {
					builder.setUnusedWitnesses(index, program.unusedWitnesses);
				}

				continue;
			}

			const { utxo } = planned;
			refuseUnsignable(utxo);

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

			const issued =
				issuance.kind === "reissue"
					? builder.addReissuanceInput(
							utxo.txid,
							utxo.vout,
							utxo.txOut,
							issuance.assetAmountSats,
							simplexEntropy(issuance.entropy),
							utxo.blindingSecretsJson ?? "",
							utxo.derivationPath,
						)
					: builder.addIssuanceInput(
							utxo.txid,
							utxo.vout,
							utxo.txOut,
							issuance.assetAmountSats,
							issuance.inflationAmountSats,
							undefined,
							utxo.blindingSecretsJson,
							utxo.derivationPath,
						);

			issued.free();
		}

		for (const [index, { sequence }] of draft.inputOrder.entries()) {
			if (sequence !== undefined) {
				builder.setInputSequence(index, sequence);
			}
		}

		const missed = draft.issuances.find((issuance) => !placed.has(outpointKey(issuance.outpoint)));

		if (missed) {
			throw new Refusal(
				`Input ${missed.inputId} issues an asset from an output this transaction does not ` +
					"spend, so the asset would never exist.",
			);
		}

		for (const output of draft.outputs) {
			builder.addOutput(
				output.scriptPubKeyHex,
				output.sats,
				output.asset,
				output.blinded ? input.blindingPublicKeyHex : undefined,
			);
		}

		return finish(builder);
	} catch (error) {
		if (error instanceof Refusal) {
			throw error;
		}

		throw new Refusal(
			`This transaction could not be assembled: ${String(error)}`,
			"built-something-else",
		);
	} finally {
		builder.free();
	}
}

function refuseUnsignable(utxo: ManifestReview["selected"][number]): void {
	const at = `${utxo.txid}:${utxo.vout}`;

	if (!utxo.confidential) {
		return;
	}

	if (utxo.blindingSecretsJson === undefined) {
		throw new Refusal(
			`This wallet holds ${at} blinded but did not say what it unblinds to, so it cannot be spent.`,
			"built-something-else",
		);
	}

	if (utxo.derivationPath === undefined) {
		throw new Refusal(
			`This wallet did not say which key spends ${at}, so it cannot be signed.`,
			"built-something-else",
		);
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

function simplexEntropy(entropy: string): string {
	return (entropy.match(/../g) ?? []).toReversed().join("");
}

function outpointKey(outpoint: { txid: string; vout: number }): string {
	return `${outpoint.txid.trim().toLowerCase()}:${outpoint.vout}`;
}
