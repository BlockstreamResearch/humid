import type { Action, Manifest } from "../document/manifest";
import {
	type BlindingDecision,
	describeBlinding,
	describePublishedChange,
} from "../evaluation/blinding";
import { Refusal } from "../refusal";
import type { ManifestReview } from "../review";
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

export type Payment = {
	address: Provenanced<string>;
	asset: Provenanced<string>;
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
	netEffect: NetEffect[];
	payments: Payment[];
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
		netEffect: review.movements.map((movement) => ({
			asset: computed(movement.asset),
			sats: computed(movement.sats),
		})),
		payments: review.outputs.flatMap((output) =>
			output.address === undefined
				? []
				: [
						{
							address: fromDapp(output.address),
							asset: computed(output.asset),
							sats: computed(output.sats),
						},
					],
		),
		protocol: fromDapp(manifest.protocol ?? ""),
		publishedAmounts: publishedAmounts(review),
		...(summary === undefined ? {} : { summary: fromDapp(summary) }),
	};
}

function blindedAmounts(review: ReviewedPlan): BlindedAmount[] {
	return review.outputs
		.filter((output) => output.blinded)
		.map((output) => ({
			decidedBy: computed(word(output.decidedBy)),
			id: fromDapp(output.id),
		}));
}

function publishedAmounts(review: ReviewedPlan): PublishedAmount[] {
	return review.outputs
		.filter((output) => !output.blinded && output.overrode !== undefined)
		.map((output) => ({
			id: fromDapp(output.id),
			reason: computed(describePublishedChange(output.overrode)),
		}));
}

function word(decidedBy: BlindingDecision["decidedBy"] | undefined): string {
	return describeBlinding({ blinding: "blinded", decidedBy: decidedBy ?? "chain" });
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

export type ShownConfirmation = Omit<ConfirmationModel, "feeSats" | "netEffect" | "payments"> & {
	feeSats: Provenanced<string>;
	netEffect: ShownAmount[];
	payments: (ShownAmount & { address: Provenanced<string> })[];
};

export function toShownConfirmation(model: ConfirmationModel): ShownConfirmation {
	return {
		...model,
		feeSats: map(model.feeSats, (sats) => sats.toString()),
		netEffect: model.netEffect.map((effect) => ({
			asset: effect.asset,
			sats: map(effect.sats, (sats) => sats.toString()),
		})),
		payments: model.payments.map((payment) => ({
			address: payment.address,
			asset: payment.asset,
			sats: map(payment.sats, (sats) => sats.toString()),
		})),
	};
}
