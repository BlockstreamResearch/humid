import type { Action, Manifest } from "../document/manifest";
import { Refusal } from "../refusal";
import type { ManifestReview } from "../review";
import type { PlannedInput, ReviewedOutput } from "../review/types";
import { describeBlinding } from "../transaction/blinding";
import type { Scope } from "../values/scope";
import { computed, fromDapp, map, type Origin, type Provenanced, verified } from "./provenance";

export type NetEffect = {
	asset: Provenanced<string>;
	sats: Provenanced<bigint>;
};

export type BlindedAmount = {
	decidedBy: Provenanced<string>;
	id: Provenanced<string>;
};

export type FlowRow = {
	address?: Provenanced<string>;
	asset: Provenanced<string>;
	dataBytes?: number;
	kind: ReviewedOutput["pays"];
	name?: Provenanced<string>;
	sats: Provenanced<bigint>;
};

export type PublishedAmount = {
	id: Provenanced<string>;
	reason: Provenanced<string>;
};

export type ProgramRow = {
	address: Provenanced<string>;
	cmr: Provenanced<string>;
	tapleafHash: Provenanced<string>;
	utxoType: Provenanced<string>;
	verified: Provenanced<boolean>;
};

export type ConfirmationModel = {
	account: Provenanced<string>;
	action: Provenanced<string>;
	programs: ProgramRow[];
	feeAsset: Provenanced<string>;
	feeSats: Provenanced<bigint>;
	blindedAmounts: BlindedAmount[];
	inputs: FlowRow[];
	netEffect: NetEffect[];
	outputs: FlowRow[];
	protocol: Provenanced<string>;
	publishedAmounts: PublishedAmount[];
	summary?: Provenanced<string>;
};

export type ReviewedPlan = Omit<ManifestReview, "confirmation">;

export function confirmationModel(
	review: ReviewedPlan,
	manifest: Manifest,
	action: Action,
	input: { accountLabel: string; policyAsset: string; scope: Scope },
): ConfirmationModel {
	const summary = intentOf(action, input.scope);

	return {
		account: computed(input.accountLabel),
		action: fromDapp(review.action),
		programs: review.programs.map((found) => ({
			address:
				found.verified === "matches-chain" ? verified(found.address) : computed(found.address),
			cmr: computed(found.cmr),
			tapleafHash: computed(found.tapleafHash),
			utxoType: fromDapp(found.utxoType),
			verified: computed(found.verified === "matches-chain"),
		})),
		feeAsset: computed(input.policyAsset),
		feeSats: computed(review.estimatedFeeSats),
		blindedAmounts: blindedAmounts(review),
		inputs: review.inputOrder.map((planned) => inputRow(review, planned)),
		netEffect: review.movements.map((movement) => ({
			asset: computed(movement.asset),
			sats: computed(movement.sats),
		})),
		outputs: review.outputs.map((output) => outputRow(review, output)),
		protocol: fromDapp(manifest.protocol ?? ""),
		publishedAmounts: publishedAmounts(review),
		...(summary === undefined ? {} : { summary: fromDapp(summary) }),
	};
}

function inputRow(review: ReviewedPlan, planned: PlannedInput): FlowRow {
	if (planned.source === "wallet") {
		return {
			asset: computed(planned.asset),
			kind: "wallet",
			sats: computed(BigInt(planned.utxo.amount)),
		};
	}

	const { asset, sats, utxoType } = planned.program;
	const found = review.programs.find((program) => program.utxoType === utxoType);

	return {
		...(found === undefined ? {} : { address: verified(found.address) }),
		asset: computed(asset),
		kind: "program",
		name: verified(utxoType),
		sats: computed(sats),
	};
}

function outputRow(review: ReviewedPlan, output: ReviewedOutput): FlowRow {
	const amount = { asset: computed(output.asset), kind: output.pays, sats: computed(output.sats) };

	switch (output.pays) {
		case "address": {
			return {
				...amount,
				address: fromDapp(output.address ?? ""),
				name: fromDapp(output.id),
			};
		}

		case "data": {
			return {
				...amount,
				dataBytes: Math.max(0, output.scriptPubKeyHex.length / 2 - 2),
				name: fromDapp(output.id),
			};
		}

		case "program": {
			const found = review.programs.find(
				(program) => program.scriptPubKeyHex === output.scriptPubKeyHex,
			);

			return found === undefined
				? { ...amount, name: fromDapp(output.id) }
				: {
						...amount,
						address:
							found.verified === "matches-chain"
								? verified(found.address)
								: computed(found.address),
						name: computed(found.utxoType),
					};
		}

		default: {
			return amount;
		}
	}
}

function blindedAmounts(review: ReviewedPlan): BlindedAmount[] {
	return review.outputs
		.filter((output) => output.blinded)
		.map((output) => ({
			decidedBy: computed(describeBlinding(output.decidedBy)),
			id: fromDapp(output.id),
		}));
}

function publishedAmounts(review: ReviewedPlan): PublishedAmount[] {
	return review.outputs
		.filter((output) => output.decidedBy === "spendable-change")
		.map((output) => ({
			id: fromDapp(output.id),
			reason: computed(describeBlinding(output.decidedBy)),
		}));
}

export function describeOrigin(origin: Origin): string {
	switch (origin) {
		case "computed": {
			return "worked out by this wallet";
		}

		case "dapp": {
			return "claimed by the dapp";
		}

		default: {
			return "checked by this wallet against the network";
		}
	}
}

function intentOf(action: Action, scope: Scope): string | undefined {
	return action.intent === undefined
		? undefined
		: action.intent.replaceAll(/\{(?<ref>[^{}:]+)(?::[^{}]*)?\}/g, (text, ref: string) => {
				const found = Refusal.attempt(() => scope.reference(ref, "expression"));

				return found === undefined ? text : String(found);
			});
}

type ShownAmount = { asset: Provenanced<string>; sats: Provenanced<string> };

export type ShownFlowRow = Omit<FlowRow, "sats"> & { sats: Provenanced<string> };

export type ShownConfirmation = Omit<
	ConfirmationModel,
	"feeSats" | "inputs" | "netEffect" | "outputs"
> & {
	feeSats: Provenanced<string>;
	inputs: ShownFlowRow[];
	netEffect: ShownAmount[];
	outputs: ShownFlowRow[];
};

export function toShownConfirmation(model: ConfirmationModel): ShownConfirmation {
	return {
		...model,
		feeSats: map(model.feeSats, (sats) => sats.toString()),
		netEffect: model.netEffect.map((effect) => ({
			asset: effect.asset,
			sats: map(effect.sats, (sats) => sats.toString()),
		})),
		inputs: model.inputs.map(shownRow),
		outputs: model.outputs.map(shownRow),
	};
}

function shownRow(row: FlowRow): ShownFlowRow {
	return { ...row, sats: map(row.sats, (sats) => sats.toString()) };
}
