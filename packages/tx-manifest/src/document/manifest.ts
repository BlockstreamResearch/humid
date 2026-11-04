import { Refusal } from "../refusal";
import { asRecord } from "./json";

export type Action = {
	boundTo?: string;
	isConstructor: boolean;
	name: string;
	node: Record<string, unknown>;
};

export class Manifest {
	readonly actions: Action[];
	readonly utxoTypes: Record<string, unknown>;

	constructor(readonly node: Record<string, unknown>) {
		this.utxoTypes = asRecord(node.utxo_types) ?? {};
		this.actions = [
			...actionsOf(node.actions),
			...Object.entries(this.#templates).flatMap(([template, declared]) =>
				actionsOf(asRecord(declared)?.actions, template),
			),
		];
	}

	get protocol(): string | undefined {
		return typeof this.node.protocol === "string" ? this.node.protocol : undefined;
	}

	get includeDebugSymbols(): boolean {
		const declared = asRecord(this.node.simplicity_hl)?.debug_symbols;

		if (declared !== undefined && typeof declared !== "boolean") {
			throw new Refusal(
				`This protocol declares simplicity_hl.debug_symbols as ${JSON.stringify(declared)}, which is neither on nor off.`,
				"unreadable-build-mode",
			);
		}

		return declared === true;
	}

	action(name: string): Action | undefined {
		return this.actions.find((action) => action.name === name);
	}

	utxoType(name: string): Record<string, unknown> | undefined {
		return asRecord(this.utxoTypes[name]);
	}

	templateFields(action: Action): Record<string, unknown> {
		return action.boundTo === undefined
			? {}
			: (asRecord(asRecord(this.#templates[action.boundTo])?.fields) ?? {});
	}

	get #templates(): Record<string, unknown> {
		return asRecord(this.node.contract_templates) ?? {};
	}
}

function actionsOf(declared: unknown, boundTo?: string): Action[] {
	return Object.entries(asRecord(declared) ?? {}).flatMap(([name, entry]) => {
		const node = asRecord(entry);

		return node
			? [
					{
						...(boundTo === undefined ? {} : { boundTo }),
						isConstructor: asRecord(node.create_instance) !== undefined,
						name,
						node,
					},
				]
			: [];
	});
}

export type InstanceFile = {
	fields: Record<string, unknown>;
	providedInputs: Record<string, unknown>;
	template?: string;
};

export function readInstance(raw: Record<string, unknown> | undefined): InstanceFile {
	const nested = asRecord(raw?.instance);
	const template = nested?.template;

	return {
		fields: asRecord(nested?.fields) ?? {},
		providedInputs: asRecord(raw?.provided_inputs) ?? {},
		...(typeof template === "string" ? { template } : {}),
	};
}
