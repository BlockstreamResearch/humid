import { baseUnits } from "../chain/integers";
import type { Outpoint } from "../chain/outpoint";
import { type ProgramInput, programInputs } from "../document/manifest";
import type { Blinding } from "../document/schema";
import { type HeldValue, resolveAsset } from "../evaluation/assetLedger";
import { resolveBlindingFactors } from "../evaluation/blindingFactors";
import { resolveAmount } from "../evaluation/plan";
import { checkWitnessNames, signatureWitness, unusedWitnesses } from "../evaluation/witness";
import { checkProgramOnChain } from "../programs/program";
import { Refusal } from "../refusal";
import type { Scope } from "../values/scope";
import type { ReviewContext } from "./context";
import type { ProgramFinding, ReviewedProgramInput } from "./index";
import { ProgramUtxos } from "./programUtxos";

export type SpentPrograms = {
	findings: ProgramFinding[];
	held: HeldValue[];
	inputs: ReviewedProgramInput[];
	scope: Scope;
	witnessTypes: Map<string, Record<string, string>>;
};

type Holding = { asset: string; blindingSecretsJson?: string; sats: bigint };

export class ProgramSpends {
	readonly #context: ReviewContext;

	constructor(context: ReviewContext) {
		this.#context = context;
	}

	async spend(prepared: Scope): Promise<SpentPrograms> {
		const { action, request } = this.#context;
		const utxos = new ProgramUtxos(request.state, request.instance?.provided_inputs ?? {});
		const spent: SpentPrograms = {
			findings: [],
			held: [],
			inputs: [],
			scope: prepared,
			witnessTypes: new Map(),
		};

		for (const input of programInputs(action)) {
			// oxlint-disable-next-line no-await-in-loop
			await this.#spendOne(input, utxos, spent);
		}

		return spent;
	}

	async #spendOne(input: ProgramInput, utxos: ProgramUtxos, spent: SpentPrograms): Promise<void> {
		const id = input.label;
		const utxoType = input.utxo_source.utxo_type;

		if (input.id === undefined) {
			throw new Refusal(
				`The ${utxoType} spent by input ${id} is given no id, so this wallet cannot ` +
					"account for what it brings.",
			);
		}

		const derived = await this.#context.derive(input.utxo_source, spent.scope);
		const asset = resolveAsset(input.asset, `input ${id}`, {
			policyAsset: this.#context.policyAsset,
			scope: spent.scope,
		});
		const outpoint = utxos.claim(id, utxoType, asset);
		const onChain = await this.#context.readTxOut(outpoint);

		checkProgramOnChain(derived, onChain.scriptPubKeyHex);

		const holding =
			input.blinding !== undefined
				? this.#blindedHolding({ ...input, blinding: input.blinding }, spent.scope)
				: onChain.amountSats !== undefined && onChain.rawAssetId !== undefined
					? explicitHolding(utxoType, outpoint, onChain.amountSats, onChain.rawAssetId)
					: await this.#reopenedHolding(input, outpoint, onChain.transactionHex, spent.scope);
		const signature = signatureWitness(input);
		const unused = unusedWitnesses(input);

		checkWitnessNames(input, derived.witnessTypes);
		spent.witnessTypes.set(id, derived.witnessTypes);
		spent.scope = spent.scope.withInput(id, { amount_sat: holding.sats, asset: holding.asset });
		spent.held.push({ asset: holding.asset, id, sats: holding.sats });
		spent.inputs.push({
			argumentsJson: derived.argumentsJson,
			extraLeavesJson: derived.extraLeavesJson,
			id,
			includeDebugSymbols: derived.includeDebugSymbols,
			...(signature === undefined ? {} : { signatureWitness: signature }),
			...(holding.blindingSecretsJson === undefined
				? {}
				: { blindingSecretsJson: holding.blindingSecretsJson }),
			source: derived.source,
			txOutHex: onChain.txOutHex,
			txid: outpoint.txid,
			...(unused.length === 0 ? {} : { unusedWitnesses: unused }),
			utxoType,
			vout: outpoint.vout,
		});
		spent.findings.push({ ...derived, role: "spent", verified: "matches-chain" });
	}

	#blindedHolding(input: ProgramInput & { blinding: Blinding }, scope: Scope): Holding {
		const at = `Input ${input.label}`;
		const { assetBlindingFactor, valueBlindingFactor } = Refusal.amend(
			() => resolveBlindingFactors(input.blinding, scope),
			(reason) => `${at} ${reason}`,
		);

		if (assetBlindingFactor === undefined || valueBlindingFactor === undefined) {
			throw new Refusal(
				`${at} states only one blinding factor of the output it spends, and a blinded output ` +
					"opens only with both.",
			);
		}

		const asset = resolveAsset(input.asset, `input ${input.label}`, {
			policyAsset: this.#context.policyAsset,
			scope,
		});
		const sats = Refusal.amend(
			() => resolveAmount(exactAmount(input), scope),
			(reason) =>
				`${at} spends a blinded output, which states its amount only through amount_sat: ${reason}`,
		);

		return {
			asset,
			blindingSecretsJson: JSON.stringify({
				asset,
				assetBlindingFactor,
				value: sats.toString(),
				valueBlindingFactor,
			}),
			sats,
		};
	}

	async #reopenedHolding(
		input: ProgramInput,
		outpoint: Outpoint,
		transactionHex: string | undefined,
		scope: Scope,
	): Promise<Holding> {
		const utxoType = input.utxo_source.utxo_type;
		const opened =
			transactionHex === undefined
				? undefined
				: await this.#context.dependencies.unblind?.(transactionHex, outpoint.vout);

		if (!opened) {
			throw new Refusal(
				`The ${utxoType} at ${outpoint.txid}:${outpoint.vout} is blinded to a key this ` +
					`wallet does not hold, and input ${input.label} states no blinding factors to open it ` +
					"with. This wallet will not assume a balance for an output it is about to spend.",
				"unbuildable-utxo-type",
			);
		}

		const declaredAsset =
			input.asset === undefined
				? undefined
				: resolveAsset(input.asset, `input ${input.label}`, {
						policyAsset: this.#context.policyAsset,
						scope,
					});
		const stated = exactAmount(input);
		const declaredSats = stated === undefined ? undefined : resolveAmount(stated, scope);

		if (
			(declaredAsset !== undefined && declaredAsset !== opened.asset) ||
			(declaredSats !== undefined && declaredSats !== opened.sats)
		) {
			throw new Refusal(
				`Input ${input.label} expects ${declaredSats ?? "an amount"} of ${declaredAsset ?? "an asset"}, ` +
					`and the ${utxoType} it spends holds ${opened.sats} of ${opened.asset}.`,
				"program-mismatch",
			);
		}

		return {
			asset: opened.asset,
			blindingSecretsJson: JSON.stringify({
				asset: opened.asset,
				assetBlindingFactor: opened.assetBlindingFactor,
				value: opened.sats.toString(),
				valueBlindingFactor: opened.valueBlindingFactor,
			}),
			sats: opened.sats,
		};
	}
}

function explicitHolding(
	utxoType: string,
	outpoint: Outpoint,
	amountSats: string,
	asset: string,
): Holding {
	const sats = baseUnits(amountSats);

	if (sats === undefined) {
		throw new Refusal(
			`The ${utxoType} at ${outpoint.txid}:${outpoint.vout} came back holding ` +
				`${JSON.stringify(amountSats)}, which is not an amount this wallet can read. It will ` +
				"not spend an output it cannot say the value of.",
			"unbuildable-utxo-type",
		);
	}

	return { asset, sats };
}

function exactAmount(input: ProgramInput): string | number | undefined {
	if (typeof input.amount_sat === "object") {
		throw new Refusal(
			`Input ${input.label} spends a program output, whose amount is stated exactly rather ` +
				"than as a minimum.",
		);
	}

	return input.amount_sat;
}
