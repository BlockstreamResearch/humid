import { outpointKey } from "../chain/outpoint";
import type { AssetLedger } from "../evaluation/assetLedger";
import { type InputPlacement, type PlaceableInput, placeInputs } from "../evaluation/inputOrder";
import type { InputRule } from "../evaluation/inputRules";
import { Refusal } from "../refusal";
import type { FundedAsset } from "./assetFunding";
import type { SelectableUtxo } from "./coinSelection";
import type { ReviewContext } from "./context";
import type { PlannedInput, ReviewedProgramInput } from "./index";
import type { ReservedFunding } from "./reservations";

export type PlacedInputs = {
	landedAt: (id: string) => number | undefined;
	placement: InputPlacement<PlannedInput>;
	selected: SelectableUtxo[];
};

export class InputLayout {
	readonly #context: ReviewContext;
	readonly #programInputs: ReviewedProgramInput[];
	readonly #reserved: ReservedFunding;
	readonly #sequenceOf: Map<string, number | undefined>;

	constructor(
		context: ReviewContext,
		programInputs: ReviewedProgramInput[],
		rules: InputRule[],
		reserved: ReservedFunding,
	) {
		this.#context = context;
		this.#programInputs = programInputs;
		this.#reserved = reserved;
		this.#sequenceOf = new Map(rules.map((rule) => [rule.id, rule.sequence]));
	}

	place(ledger: AssetLedger, funded: FundedAsset[]): PlacedInputs {
		const fundedFor = new Map(funded.map((entry) => [entry.asset, entry]));
		const reservedFor = new Map(this.#reserved.map((held) => [held.inputId, held.utxo]));
		const reservedKeys = new Set(this.#reserved.map((held) => outpointKey(held.utxo)));
		const unreserved = (asset: string) =>
			(fundedFor.get(asset)?.selected ?? []).filter((utxo) => !reservedKeys.has(outpointKey(utxo)));
		const fundedOrder = [
			...new Set([
				...ledger.walletInputs.map((wallet) => wallet.asset),
				...funded.map((entry) => entry.asset),
			]),
		];
		const creditedWith = new Map<string, string>();
		const fundedWith = new Map<string, string>();
		const walletRuns = new Map<string, PlannedInput[]>();

		for (const wallet of ledger.walletInputs) {
			const own = reservedFor.get(wallet.id);

			if (own) {
				walletRuns.set(wallet.id, [this.#walletSlot(wallet.id, own)]);

				continue;
			}

			const credited = creditedWith.get(wallet.asset);

			if (credited !== undefined) {
				if (this.#sequenceOf.get(wallet.id) !== this.#sequenceOf.get(credited)) {
					throw new Refusal(
						`Inputs ${credited} and ${wallet.id} are funded from one selection of this ` +
							"wallet's outputs and ask for different sequences, so this wallet cannot " +
							"say which of those outputs waits for which.",
						"unimplemented-construct",
					);
				}

				fundedWith.set(wallet.id, credited);

				continue;
			}

			creditedWith.set(wallet.asset, wallet.id);
			walletRuns.set(
				wallet.id,
				unreserved(wallet.asset).map((utxo) => this.#walletSlot(wallet.id, utxo)),
			);
		}

		const placeable: PlaceableInput<PlannedInput>[] = this.#context.action.inputs.map(
			({ label: id, required_index: wanted }) => {
				const program = this.#programInputs.find((candidate) => candidate.id === id);

				return {
					id,
					slots: program
						? [{ program, source: "program" as const, ...this.#sequence(id) }]
						: (walletRuns.get(id) ?? []),
					...(wanted === undefined ? {} : { stated: wanted }),
				};
			},
		);
		const undeclared = fundedOrder
			.filter((asset) => !creditedWith.has(asset))
			.flatMap((asset) => unreserved(asset));

		if (undeclared.length > 0) {
			placeable.push({ slots: undeclared.map((utxo) => ({ source: "wallet" as const, utxo })) });
		}

		const placement = placeInputs(placeable);

		return {
			landedAt: (id) => {
				const own = placement.at.get(id);

				if (own !== undefined) {
					return own;
				}

				const credited = fundedWith.get(id);
				const start = credited === undefined ? undefined : placement.at.get(credited);

				return start === undefined
					? undefined
					: start + (walletRuns.get(credited ?? "")?.length ?? 0);
			},
			placement,
			selected: fundedOrder.flatMap((asset) => fundedFor.get(asset)?.selected ?? []),
		};
	}

	#walletSlot(id: string, utxo: SelectableUtxo): PlannedInput {
		return { source: "wallet", utxo, ...this.#sequence(id) };
	}

	#sequence(id: string): { sequence?: number } {
		const sequence = this.#sequenceOf.get(id);

		return sequence === undefined ? {} : { sequence };
	}
}
