import { Refusal } from "../refusal";
import { type AssetLedger, assetLedger, type HeldValue } from "../transaction/assetLedger";
import type { InputRule } from "../transaction/inputRules";
import type { PlannedIssuance } from "../transaction/issuance";
import { planAction, type PlannedSpend } from "../transaction/plan";
import { checkPositions, type StatedPosition } from "../transaction/positions";
import type { Scope } from "../values/scope";
import type { ReviewContext } from "./context";
import { Funding } from "./funding";
import { InputLayout, type PlacedInputs } from "./inputLayout";
import { OutputPayer, type PaidOutputs } from "./outputPayer";
import type { ReservedFunding } from "./reservations";
import type { ProgramFinding, ReviewedProgramInput, TransactionDraft } from "./types";

const FEE_ROUNDS = 4;

export type Settled = {
	draft: TransactionDraft;
	feeSats: bigint;
	ledger: AssetLedger;
	paid: PaidOutputs;
	placed: PlacedInputs;
	scope: Scope;
};

export type SettlementParts = {
	feeRateSatsPerKvb: number;
	held: HeldValue[];
	issuances: PlannedIssuance[];
	locktimeHeight?: number;
	programInputs: ReviewedProgramInput[];
	programs: ProgramFinding[];
	reserved: ReservedFunding;
	rules: InputRule[];
};

export class Settlement {
	readonly #context: ReviewContext;
	readonly #funding: Funding;
	readonly #layout: InputLayout;
	readonly #parts: SettlementParts;
	readonly #payer: OutputPayer;

	constructor(context: ReviewContext, parts: SettlementParts) {
		this.#context = context;
		this.#parts = parts;
		this.#funding = new Funding(context, parts.rules, parts.reserved);
		this.#payer = new OutputPayer(context, parts.programInputs, parts.programs);
		this.#layout = new InputLayout(context, parts.programInputs, parts.rules, parts.reserved);
	}

	async atStableFee(scope: Scope): Promise<Settled> {
		let settled = await this.#once(scope);

		for (let round = 1; settled.feeSats > (settled.scope.fee ?? 0n); round += 1) {
			if (round === FEE_ROUNDS) {
				throw new Refusal(
					`The fee for "${this.#context.request.action}" kept rising as this wallet funded the ` +
						"action, so the wallet cannot say what the transaction costs.",
					"built-something-else",
				);
			}

			// oxlint-disable-next-line no-await-in-loop
			settled = await this.#once(settled.scope.withFee(settled.feeSats));
		}

		return settled;
	}

	async #once(scope: Scope): Promise<Settled> {
		const plan = planAction(this.#context.action, scope, this.#context.declaredTypes);
		const ledger = this.#ledger(plan, scope);
		const funded = this.#funding.fund(ledger, scope);
		const paid = this.#payer.pay(plan, ledger, funded);
		const placed = this.#layout.place(ledger, funded);

		this.#checkPositions(placed, paid);

		const { feeRateSatsPerKvb, issuances, locktimeHeight } = this.#parts;
		const draft: TransactionDraft = {
			action: this.#context.request.action,
			inputOrder: placed.placement.order,
			issuances,
			outputs: paid.outputs,
			...(locktimeHeight === undefined ? {} : { locktimeHeight }),
		};
		const feeSats = await this.#context.estimate(draft, feeRateSatsPerKvb);

		return { draft, feeSats, ledger, paid, placed, scope };
	}

	#ledger(plan: PlannedSpend, scope: Scope): AssetLedger {
		const issued = this.#parts.issuances.flatMap((issuance) =>
			[
				{ asset: issuance.asset, sats: issuance.assetAmountSats },
				{ asset: issuance.reissuanceToken, sats: issuance.inflationAmountSats },
			]
				.filter(({ sats }) => sats > 0n)
				.map(({ asset, sats }) => ({ asset, created: true as const, id: issuance.inputId, sats })),
		);

		return assetLedger(this.#context.action, plan.outputs, {
			held: [...this.#parts.held, ...issued],
			policyAsset: this.#context.policyAsset,
			scope,
		});
	}

	#checkPositions(placed: PlacedInputs, paid: PaidOutputs): void {
		const { action } = this.#context;
		const positions: StatedPosition[] = [];

		for (const { label: id, required_index: stated } of action.inputs) {
			if (stated !== undefined) {
				positions.push({
					at: placed.landedAt(id) ?? placed.placement.order.length,
					id,
					kind: "input",
					stated,
				});
			}
		}

		for (const { id, required_index: stated } of action.outputs) {
			if (stated === undefined) {
				continue;
			}

			if (id === undefined) {
				throw new Refusal(
					"This action states a position for an output the manifest gives no id, so this " +
						"wallet cannot say which output it is or where it landed.",
					"unbuildable-position",
				);
			}

			positions.push({ at: paid.at.get(id) ?? paid.outputs.length, id, kind: "output", stated });
		}

		checkPositions(positions, {
			inputs: placed.placement.order.length,
			outputs: paid.outputs.length,
		});
	}
}
