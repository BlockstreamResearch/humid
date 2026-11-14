import { byOutpoint, outpointKey } from "../chain/outpoint";
import type { Input } from "../document/manifest";
import type { Issuance } from "../document/schema";
import { Refusal } from "../refusal";
import { resolveAsset } from "../transaction/assetLedger";
import { type SelectableUtxo, toSats } from "../transaction/coinSelection";
import {
	issuanceAttributes,
	issuanceIdentity,
	type PlannedIssuance,
	reissuanceOf,
} from "../transaction/issuance";
import { resolveAmount } from "../transaction/plan";
import type { Scope } from "../values/scope";
import type { ReviewContext } from "./context";
import type { ReviewedProgramInput } from "./types";

export type ReservedFunding = { asset: string; inputId: string; utxo: SelectableUtxo }[];

export type Reserved = {
	identities: { declared: Issuance; planned: PlannedIssuance }[];
	reserved: ReservedFunding;
	scope: Scope;
};

export type WalletAmount = { exact: boolean; sats: bigint };

export class Reservations {
	readonly #context: ReviewContext;
	readonly #programInputs: ReviewedProgramInput[];
	readonly #pools = new Map<string, SelectableUtxo[]>();
	readonly #taken = new Set<string>();

	constructor(context: ReviewContext, programInputs: ReviewedProgramInput[]) {
		this.#context = context;
		this.#programInputs = programInputs;
	}

	reserve(spent: Scope): Reserved {
		const reserved: Reserved = { identities: [], reserved: [], scope: spent };

		for (const input of this.#context.action.inputs) {
			this.#reserveFor(input, reserved);
		}

		return reserved;
	}

	#reserveFor(input: Input, reserved: Reserved): void {
		const { issuance, label: id } = input;
		const { scope } = reserved;
		const policyAsset = this.#context.policyAsset;
		const stated = input.utxo_source === "wallet" ? walletAmount(input, scope) : undefined;
		const fits = (utxo: SelectableUtxo) =>
			stated === undefined ||
			(stated.exact ? toSats(utxo) === stated.sats : toSats(utxo) >= stated.sats);

		if (!issuance) {
			if (stated?.exact) {
				const asset = resolveAsset(input.asset, `input ${id}`, { policyAsset, scope });
				const funding = this.#candidatesIn(asset).find(
					(utxo) => !this.#taken.has(outpointKey(utxo)) && fits(utxo),
				);

				if (!funding) {
					throw new Refusal(
						`Input ${id} spends one output of this wallet holding exactly ${stated.sats} of ` +
							`${asset}, and there is none left to use.`,
						"shortfall",
					);
				}

				this.#taken.add(outpointKey(funding));
				reserved.reserved.push({ asset, inputId: id, utxo: funding });
			}

			return;
		}

		const reissues = issuance.kind === "reissue";
		const program = this.#programInputs.find((candidate) => candidate.id === id);
		const asset = reissues
			? reissuedToken(input, issuance, { policyAsset, scope })
			: resolveAsset(input.asset, `input ${id}`, { policyAsset, scope });

		if (program) {
			const outpoint = { txid: program.txid, vout: program.vout };
			const key = outpointKey(outpoint);

			if (
				reissues &&
				(program.blindingSecretsJson === undefined || scope.inputs[id]?.asset !== asset)
			) {
				throw new Refusal(
					`Input ${id} reissues an asset, which needs the program it spends to hold that ` +
						`asset's reissuance token ${asset} blinded, and the program holds something else.`,
				);
			}

			if (this.#taken.has(key)) {
				throw new Refusal(
					`Input ${id} issues an asset from ${outpoint.txid}:${outpoint.vout}, which ` +
						"another input of this transaction already issues from. One output cannot " +
						"create two assets.",
				);
			}

			this.#taken.add(key);
			this.#record(
				reserved,
				issuance,
				issuanceIdentity({ declared: issuance, id, outpoint }, scope),
			);

			return;
		}

		const funding = this.#candidatesIn(asset).find(
			(utxo) =>
				!this.#taken.has(outpointKey(utxo)) &&
				(!reissues || utxo.confidential === true) &&
				fits(utxo),
		);

		if (!funding) {
			throw new Refusal(
				reissues
					? `Input ${id} reissues an asset, which needs a blinded output of this wallet ` +
							`holding its reissuance token ${asset}, and there is none left to use.`
					: `Input ${id} issues an asset, which needs one of this wallet's own outputs in ` +
							`${asset} to derive it from, and there is none left to use.`,
				"shortfall",
			);
		}

		this.#taken.add(outpointKey(funding));
		reserved.reserved.push({ asset, inputId: id, utxo: funding });
		this.#record(
			reserved,
			issuance,
			issuanceIdentity(
				{ declared: issuance, id, outpoint: { txid: funding.txid, vout: funding.vout } },
				scope,
			),
		);
	}

	#record(reserved: Reserved, declared: Issuance, planned: PlannedIssuance): void {
		reserved.identities.push({ declared, planned });
		reserved.scope = reserved.scope.withInput(planned.inputId, issuanceAttributes(planned));
	}

	#candidatesIn(asset: string): SelectableUtxo[] {
		const existing = this.#pools.get(asset);

		if (existing) {
			return existing;
		}

		const smallestFirst = asset === this.#context.policyAsset;
		const ordered = byOutpoint(
			this.#context.holdings(asset).filter((utxo) => utxo.spendable),
		).toSorted((one, other) => bySize(toSats(one), toSats(other), smallestFirst));

		this.#pools.set(asset, ordered);

		return ordered;
	}
}

export function walletAmount(input: Input, scope: Scope): WalletAmount | undefined {
	const declared = input.amount_sat;

	if (declared === undefined) {
		return undefined;
	}

	const exact = typeof declared !== "object";
	const sats = Refusal.amend(
		() => resolveAmount(exact ? declared : declared.min_amount, scope),
		(reason) => `Input ${input.label} states an amount this wallet cannot work out: ${reason}`,
	);

	return { exact, sats };
}

function reissuedToken(
	input: Input,
	issuance: Issuance,
	context: { policyAsset: string; scope: Scope },
): string {
	const id = input.label;
	const token = reissuanceOf(issuance, id, context.scope).reissuanceToken;
	const spent = resolveAsset(input.asset, `input ${id}`, context);

	if (spent !== token) {
		throw new Refusal(
			`Input ${id} reissues an asset whose reissuance token is ${token}, and declares that ` +
				`it spends ${spent}. A reissuing input spends its token.`,
		);
	}

	return token;
}

function bySize(left: bigint, right: bigint, smallestFirst: boolean): number {
	if (left === right) {
		return 0;
	}

	return left > right === smallestFirst ? 1 : -1;
}
