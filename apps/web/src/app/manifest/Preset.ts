import type {
	LiquidProcessConfidentialTransactionIssuance,
	LiquidProcessConfidentialTransactionParams,
} from "@humid/appkit-injected-adapter";

export type SentStep = {
	action: string;
	deployment?: Record<string, string>;
	issuances?: LiquidProcessConfidentialTransactionIssuance[];
	spent?: string;
	txid: string;
};

export type PresetStep = {
	action: string;
	after?: string[];
	from?: string;
	params?: (key: string, earlier?: SentStep) => Record<string, unknown>;
	spends?: { utxoType: string; vout: number };
};

type PresetDocument = Pick<
	LiquidProcessConfidentialTransactionParams,
	"contractSources" | "manifest"
>;

export class Preset {
	readonly name: string;
	readonly description: string;
	readonly steps: PresetStep[];
	readonly #document: PresetDocument;
	readonly #template?: string;

	constructor(
		name: string,
		description: string,
		steps: PresetStep[],
		document: PresetDocument,
		template?: string,
	) {
		this.name = name;
		this.description = description;
		this.steps = steps;
		this.#document = document;
		this.#template = template;
	}

	request(
		step: PresetStep,
		key: string,
		sent: Record<string, SentStep[]>,
	): LiquidProcessConfidentialTransactionParams | undefined {
		const earlier =
			step.after === undefined
				? undefined
				: sent[step.from ?? this.name]?.findLast((before) => step.after!.includes(before.action));

		if (step.after !== undefined && earlier === undefined) return undefined;

		if (
			step.spends !== undefined &&
			Object.values(sent).some((steps) => steps.some((later) => later.spent === earlier?.txid))
		) {
			return undefined;
		}

		const deployment = sent[this.name]?.findLast((own) => own.deployment !== undefined)?.deployment;

		return {
			action: step.action,
			broadcast: true,
			...this.#document,
			params: step.params?.(key, earlier) ?? {},
			...(this.#template === undefined || deployment === undefined
				? {}
				: { instance: { instance: { fields: deployment, template: this.#template } } }),
			...(earlier === undefined || step.spends === undefined
				? {}
				: {
						state: {
							utxos: [
								{ txid: earlier.txid, utxo_type: step.spends.utxoType, vout: step.spends.vout },
							],
						},
					}),
		};
	}
}
