import { type Outpoint, outpointKey } from "../chain/outpoint";
import { asArray, asRecord } from "../document/json";
import { Refusal } from "../refusal";

type ListedUtxo = Outpoint & { asset?: string; utxoType: unknown };

export class ProgramUtxos {
	readonly #claimed = new Set<string>();
	readonly #listed: ListedUtxo[];
	readonly #pinned: Record<string, unknown>;

	constructor(state: Record<string, unknown> | undefined, pinned: Record<string, unknown>) {
		const reserved = new Set(
			Object.values(pinned).flatMap((pin) => {
				const outpoint = outpointOf(pin);

				return outpoint ? [outpointKey(outpoint)] : [];
			}),
		);

		this.#pinned = pinned;
		this.#listed = asArray(state?.utxos).flatMap((entry) => {
			const outpoint = outpointOf(entry);
			const record = asRecord(entry);

			if (!outpoint || reserved.has(outpointKey(outpoint))) {
				return [];
			}

			const asset = typeof record?.asset === "string" ? record.asset.toLowerCase() : undefined;

			return [
				{ ...outpoint, ...(asset === undefined ? {} : { asset }), utxoType: record?.utxo_type },
			];
		});
	}

	claim(inputId: string, utxoType: string, asset?: string): Outpoint {
		const outpoint =
			inputId in this.#pinned
				? outpointOf(this.#pinned[inputId])
				: this.#listedFor(utxoType, asset);

		if (!outpoint) {
			throw inputId in this.#pinned
				? new Refusal(
						`The instance file pins input ${inputId} to something that is not an outpoint.`,
					)
				: new Refusal(
						`The state file lists no ${utxoType} left for input ${inputId} to spend.`,
						"no-utxo-to-spend",
					);
		}

		const key = outpointKey(outpoint);

		if (this.#claimed.has(key)) {
			throw new Refusal(
				`Input ${inputId} would spend ${key}, which another input of this action already spends.`,
			);
		}

		this.#claimed.add(key);

		return outpoint;
	}

	#listedFor(utxoType: string, asset: string | undefined): Outpoint | undefined {
		const open = this.#listed.filter(
			(utxo) => utxo.utxoType === utxoType && !this.#claimed.has(outpointKey(utxo)),
		);
		const found = open.find((utxo) => utxo.asset === asset) ?? open[0];

		return found && { txid: found.txid, vout: found.vout };
	}
}

function outpointOf(value: unknown): Outpoint | undefined {
	const record = asRecord(value);

	return typeof record?.txid === "string" && typeof record.vout === "number"
		? { txid: record.txid, vout: record.vout }
		: undefined;
}
