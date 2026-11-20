import type {
	LiquidProcessConfidentialTransactionIssuance,
	LiquidProcessConfidentialTransactionParams,
} from "@humid/appkit-injected-adapter";

export type SentStep = {
	action: string;
	deployment?: Record<string, string>;
	issuances?: LiquidProcessConfidentialTransactionIssuance[];
	/** The outputs this step spent, as txid:vout. */
	spent?: string[];
	txid: string;
};

export type Account = { address: string; key: string };

export type PresetOutput = { utxoType: string; vout: number };

export type PresetStep = {
	action: string;
	after?: string[];
	/** The actions whose deployment the step runs under; the latest of any by default. */
	deployedBy?: string[];
	from?: string;
	/** Undefined while something the params need has not been sent yet. */
	params?: (
		account: Account,
		earlier: SentStep | undefined,
		sent: Record<string, SentStep[]>,
	) => Record<string, unknown> | undefined;
	spends?: PresetOutput[];
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
		account: Account,
		sent: Record<string, SentStep[]>,
	): LiquidProcessConfidentialTransactionParams | undefined {
		const earlier =
			step.after === undefined
				? undefined
				: sent[step.from ?? this.name]?.findLast((before) => step.after!.includes(before.action));

		if (step.after !== undefined && earlier === undefined) return undefined;

		const spent = new Set(
			Object.values(sent).flatMap((steps) => steps.flatMap((later) => later.spent ?? [])),
		);

		if (step.spends?.some(({ vout }) => spent.has(`${earlier?.txid}:${vout}`))) {
			return undefined;
		}

		const params = step.params === undefined ? {} : step.params(account, earlier, sent);

		if (params === undefined) return undefined;

		const deployment = sent[this.name]?.findLast(
			(own) =>
				own.deployment !== undefined &&
				(step.deployedBy === undefined || step.deployedBy.includes(own.action)),
		)?.deployment;

		return {
			action: step.action,
			broadcast: true,
			...this.#document,
			params,
			...(this.#template === undefined || deployment === undefined
				? {}
				: { instance: { instance: { fields: deployment, template: this.#template } } }),
			...(earlier === undefined || step.spends === undefined
				? {}
				: {
						state: {
							utxos: step.spends.map(({ utxoType, vout }) => ({
								txid: earlier.txid,
								utxo_type: utxoType,
								vout,
							})),
						},
					}),
		};
	}
}
