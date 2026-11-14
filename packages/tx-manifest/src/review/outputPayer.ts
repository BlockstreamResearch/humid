import type { AssetLedger } from "../evaluation/assetLedger";
import { type BlindingDecision, resolveChangeBlinding } from "../evaluation/blinding";
import type { BlindingFactors } from "../evaluation/blindingFactors";
import type { PlannedOutput, PlannedSpend } from "../evaluation/plan";
import { Refusal } from "../refusal";
import type { FundedAsset } from "./assetFunding";
import type { ReviewContext } from "./context";
import type { ProgramFinding, ReviewedOutput, ReviewedProgramInput } from "./index";

const DUST_SATS = 22n;

const UNDECLARED_CHANGE: BlindingDecision = {
	blinding: "open",
	decidedBy: "spendable-change",
	overrode: "chain",
};

export type PaidOutputs = {
	at: Map<string, number>;
	droppedSats: bigint;
	outputs: ReviewedOutput[];
	returned: Map<string, bigint>;
};

export class OutputPayer {
	readonly #context: ReviewContext;
	readonly #programInputs: ReviewedProgramInput[];
	readonly #programScripts: Map<string, string>;

	constructor(
		context: ReviewContext,
		programInputs: ReviewedProgramInput[],
		programs: ProgramFinding[],
	) {
		this.#context = context;
		this.#programInputs = programInputs;
		this.#programScripts = new Map(
			programs.map((found) => [found.utxoType, found.scriptPubKeyHex]),
		);
	}

	pay(plan: PlannedSpend, ledger: AssetLedger, funded: FundedAsset[]): PaidOutputs {
		const changeFor = new Map(funded.map((entry) => [entry.asset, entry.changeSats]));
		const spendsConfidential =
			this.#programInputs.some((program) => program.blindingSecretsJson !== undefined) ||
			funded.some((entry) => entry.selected.some((utxo) => utxo.confidential === true));
		const paid: PaidOutputs = { at: new Map(), droppedSats: 0n, outputs: [], returned: new Map() };
		const payChange = (
			asset: string,
			id: string,
			planned: BlindingDecision,
			factors?: BlindingFactors,
		) => {
			const sats = changeFor.get(asset) ?? 0n;

			changeFor.delete(asset);
			this.#payChange(paid, { asset, factors, id, planned, sats, spendsConfidential });
		};

		for (const [at, planned] of plan.outputs.entries()) {
			const asset = ledger.outputs[at] ?? this.#context.policyAsset;

			if (planned.target.kind === "change") {
				payChange(asset, planned.id, planned.blinding, planned.factors);
			} else if (planned.sats !== undefined) {
				this.#payPlanned(paid, planned, asset, planned.sats);
			}
		}

		for (const asset of changeFor.keys()) {
			payChange(asset, "change", UNDECLARED_CHANGE);
		}

		return paid;
	}

	#payPlanned(paid: PaidOutputs, planned: PlannedOutput, asset: string, sats: bigint): void {
		const { blinding, factors, id, target } = planned;

		if (target.kind === "address") {
			const { blindingPublicKeyHex, scriptPubKeyHex } = this.#context.readAddress(target.address);
			const blinds = blinding.blinding === "blinded";

			if (blinds && blindingPublicKeyHex === undefined && blinding.decidedBy === "output") {
				throw new Refusal(
					`Output ${id} must be blinded and pays ${target.address}, ` +
						"an address that carries no blinding key to blind it with.",
				);
			}

			const blinded = blinds && blindingPublicKeyHex !== undefined;

			push(paid, {
				address: target.address,
				asset,
				blinded,
				...(blinded ? { blindingPublicKeyHex } : {}),
				...chosenFactors(id, factors, blinded),
				decidedBy: blinded ? blinding.decidedBy : "unblindable",
				id,
				sats,
				scriptPubKeyHex,
			});

			return;
		}

		const scriptPubKeyHex =
			target.kind === "program"
				? this.#programScripts.get(target.utxoType)
				: target.kind === "data"
					? target.hex
					: this.#context.dependencies.walletScriptPubKeyHex;

		if (!scriptPubKeyHex) {
			throw new Refusal(
				`Output ${id} pays a program the wallet did not verify.`,
				"program-mismatch",
			);
		}

		if (target.kind === "wallet") {
			paid.returned.set(asset, (paid.returned.get(asset) ?? 0n) + sats);
		}

		const blinded = blinding.blinding === "blinded";

		push(paid, {
			asset,
			blinded,
			...chosenFactors(id, factors, blinded),
			decidedBy: blinding.decidedBy,
			id,
			sats,
			scriptPubKeyHex,
		});
	}

	#payChange(
		paid: PaidOutputs,
		change: {
			asset: string;
			factors: BlindingFactors | undefined;
			id: string;
			planned: BlindingDecision;
			sats: bigint;
			spendsConfidential: boolean;
		},
	): void {
		const { asset, id, sats } = change;

		if (sats <= 0n) {
			return;
		}

		const isPolicy = asset === this.#context.policyAsset;

		if (isPolicy && sats < DUST_SATS) {
			paid.droppedSats = sats;

			return;
		}

		const blinding = isPolicy
			? resolveChangeBlinding(change.planned, change.spendsConfidential)
			: change.planned;
		const blinded = blinding.blinding === "blinded";

		push(paid, {
			asset,
			blinded,
			...chosenFactors(id, change.factors, blinded),
			decidedBy: blinding.decidedBy,
			id,
			...(blinding.overrode === undefined ? {} : { overrode: blinding.overrode }),
			sats,
			scriptPubKeyHex: this.#context.dependencies.walletScriptPubKeyHex,
		});
	}
}

function push(paid: PaidOutputs, output: ReviewedOutput): void {
	paid.at.set(output.id, paid.outputs.length);
	paid.outputs.push(output);
}

function chosenFactors(
	id: string,
	factors: BlindingFactors | undefined,
	blinded: boolean,
): BlindingFactors {
	if (factors === undefined) {
		return {};
	}

	if (!blinded) {
		throw new Refusal(
			`Output ${id} chooses blinding factors and is not blinded, so nothing would blind it with them.`,
		);
	}

	return factors;
}
