import { type Outpoint, outpointKey } from "../chain/outpoint";
import { Refusal } from "../refusal";
import type { StateFile } from "../request/request";

type ListedUtxo = NonNullable<StateFile["utxos"]>[number];

export class ProgramUtxos {
	readonly #claimed = new Set<string>();
	readonly #listed: ListedUtxo[];
	readonly #pinned: Record<string, Outpoint>;

	constructor(state: StateFile | undefined, pinned: Record<string, Outpoint>) {
		const reserved = new Set(Object.values(pinned).map((pin) => outpointKey(pin)));

		this.#pinned = pinned;
		this.#listed = (state?.utxos ?? []).filter((utxo) => !reserved.has(outpointKey(utxo)));
	}

	claim(inputId: string, utxoType: string, asset: string): Outpoint {
		const outpoint = this.#pinned[inputId] ?? this.#listedFor(utxoType, asset);

		if (!outpoint) {
			throw new Refusal(
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

		return { txid: outpoint.txid, vout: outpoint.vout };
	}

	#listedFor(utxoType: string, asset: string): Outpoint | undefined {
		const open = this.#listed.filter(
			(utxo) => utxo.utxo_type === utxoType && !this.#claimed.has(outpointKey(utxo)),
		);

		return open.find((utxo) => utxo.asset?.toLowerCase() === asset) ?? open[0];
	}
}
