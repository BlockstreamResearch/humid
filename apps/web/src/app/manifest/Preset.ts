import type { LiquidProcessConfidentialTransactionParams } from "@humid/appkit-injected-adapter";

export type SentStep = {
	action: string;
	deployment?: Record<string, string>;
	spent?: string;
	txid: string;
};

export type PresetStep = {
	action: string;
	params?: (key: string) => Record<string, unknown>;
	spends?: { after: string[]; utxoType: string; vout: number };
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
		sent: SentStep[],
	): LiquidProcessConfidentialTransactionParams | undefined {
		const spent =
			step.spends === undefined
				? undefined
				: sent.findLast((earlier) => step.spends!.after.includes(earlier.action));

		if (
			step.spends !== undefined &&
			(spent === undefined || sent.some((later) => later.spent === spent.txid))
		) {
			return undefined;
		}

		const deployment = sent.findLast((earlier) => earlier.deployment !== undefined)?.deployment;

		return {
			action: step.action,
			broadcast: true,
			...this.#document,
			params: step.params?.(key) ?? {},
			...(this.#template === undefined || deployment === undefined
				? {}
				: { instance: { instance: { fields: deployment, template: this.#template } } }),
			...(spent === undefined || step.spends === undefined
				? {}
				: {
						state: {
							utxos: [
								{ txid: spent.txid, utxo_type: step.spends.utxoType, vout: step.spends.vout },
							],
						},
					}),
		};
	}
}
