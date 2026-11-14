import type { AssetLedger } from "../evaluation/assetLedger";
import type { InputRule } from "../evaluation/inputRules";
import { Refusal } from "../refusal";
import type { Scope } from "../values/scope";
import { type AssetHoldings, type FundedAsset, fundAssets } from "./assetFunding";
import type { ReviewContext } from "./context";
import { type ReservedFunding, walletAmount } from "./reservations";

type Pin = { id: string; script: string };

export class Funding {
	readonly #context: ReviewContext;
	readonly #reserved: ReservedFunding;
	readonly #rules: InputRule[];

	constructor(context: ReviewContext, rules: InputRule[], reserved: ReservedFunding) {
		this.#context = context;
		this.#rules = rules;
		this.#reserved = reserved;
	}

	fund(ledger: AssetLedger, scope: Scope): FundedAsset[] {
		const pinFor = this.#pinsByInput(ledger);
		const pinnedAsset = this.#pinsByAsset(ledger, pinFor);
		const holdings: AssetHoldings = (asset) => {
			const pin = pinnedAsset.get(asset);
			const pool = this.#context.holdings(asset);

			return pin === undefined
				? pool
				: pool.filter((utxo) => sameScript(utxo.scriptPubKeyHex ?? "", pin.script));
		};

		for (const [asset, pin] of pinnedAsset) {
			const committed = this.#reserved.some((held) => held.asset === asset);

			if (holdings(asset).length === 0 && !committed) {
				throw new Refusal(
					`This action must fund input ${pin.id} from ${pin.script}, and this wallet holds ` +
						`nothing in ${asset} there.`,
					"no-funds-at-signing-address",
				);
			}
		}

		const misplaced = this.#reserved.find((held) => {
			const script = pinFor.get(held.inputId);

			return script !== undefined && !sameScript(held.utxo.scriptPubKeyHex ?? "", script);
		});

		if (misplaced) {
			throw new Refusal(
				`This action must fund input ${misplaced.inputId} from ` +
					`${pinFor.get(misplaced.inputId) ?? ""}, and the output it issues an asset from is not ` +
					"there.",
				"no-funds-at-signing-address",
			);
		}

		return fundAssets(ledger.entries, {
			feeSats: scope.fee ?? 0n,
			floors: this.#minimums(ledger, scope),
			holdings,
			mayReturn: (asset) => this.#context.mayReturn(asset),
			policyAsset: this.#context.policyAsset,
			reserved: this.#reserved,
		});
	}

	#pinsByInput(ledger: AssetLedger): Map<string, string> {
		const pinFor = new Map<string, string>();
		const fundedInput = new Set(ledger.walletInputs.map((wallet) => wallet.id));

		for (const rule of this.#rules) {
			if (rule.fromAddress === undefined) {
				continue;
			}

			const script = this.#context.readAddress(rule.fromAddress).scriptPubKeyHex;

			if (!fundedInput.has(rule.id)) {
				throw new Refusal(
					`This action requires input ${rule.id} to be funded from ${script}, and that input is ` +
						"not one this wallet funds out of its own outputs.",
				);
			}

			pinFor.set(rule.id, script);
		}

		return pinFor;
	}

	#pinsByAsset(ledger: AssetLedger, pinFor: Map<string, string>): Map<string, Pin> {
		const pinnedAsset = new Map<string, Pin>();

		for (const wallet of ledger.walletInputs) {
			const script = pinFor.get(wallet.id);

			if (script === undefined) {
				continue;
			}

			const already = pinnedAsset.get(wallet.asset);

			if (already && !sameScript(already.script, script)) {
				throw new Refusal(
					`This action requires input ${already.id} to be funded from ${already.script} and ` +
						`input ${wallet.id} from ${script}, and both are funded in ${wallet.asset} out of ` +
						"one selection. This wallet cannot fund one run of outputs from two places.",
					"no-funds-at-signing-address",
				);
			}

			pinnedAsset.set(wallet.asset, { id: wallet.id, script });
		}

		return pinnedAsset;
	}

	#minimums(ledger: AssetLedger, scope: Scope): Map<string, bigint> {
		const assetOf = new Map(ledger.walletInputs.map((wallet) => [wallet.id, wallet.asset]));
		const floors = new Map<string, bigint>();

		for (const input of this.#context.action.inputs) {
			const stated = input.utxo_source === "wallet" ? walletAmount(input, scope) : undefined;
			const asset = assetOf.get(input.label);

			if (
				stated === undefined ||
				stated.exact ||
				asset === undefined ||
				this.#reserved.some((held) => held.inputId === input.label)
			) {
				continue;
			}

			floors.set(asset, (floors.get(asset) ?? 0n) + stated.sats);
		}

		return floors;
	}
}

function sameScript(one: string, other: string): boolean {
	return one.trim().toLowerCase() === other.trim().toLowerCase();
}
