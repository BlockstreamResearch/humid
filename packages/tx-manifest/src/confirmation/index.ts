import type { Action, Manifest } from "../document/manifest";
import { type ReferenceScope, resolveReference } from "../document/references";
import {
	type BlindingDecision,
	describeBlinding,
	describePublishedChange,
} from "../evaluation/blinding";
import { Refusal } from "../refusal";
import type { ManifestReview } from "../review";
import { computed, fromDapp, map, type Origin, type Provenanced, verified } from "./provenance";

export type NetEffect = {
	asset: Provenanced<string>;
	sats: Provenanced<bigint>;
};

export type BlindedAmount = {
	decidedBy: Provenanced<string>;
	id: Provenanced<string>;
};

export type PublishedAmount = {
	id: Provenanced<string>;
	reason: Provenanced<string>;
};

export type CovenantRow = {
	address: Provenanced<string>;
	cmr: Provenanced<string>;
	tapleafHash: Provenanced<string>;
	utxoType: Provenanced<string>;
	verified: Provenanced<boolean>;
};

export type ConfirmationModel = {
	account: Provenanced<string>;
	action: Provenanced<string>;
	covenants: CovenantRow[];
	feeAsset: Provenanced<string>;
	feeSats: Provenanced<bigint>;
	blindedAmounts: BlindedAmount[];
	netEffect: NetEffect[];
	protocol: Provenanced<string>;
	publishedAmounts: PublishedAmount[];
	summary?: Provenanced<string>;
};

export type ReviewedPlan = Omit<ManifestReview, "confirmation">;

export function confirmationModel(
	review: ReviewedPlan,
	manifest: Manifest,
	action: Action,
	input: { accountLabel: string; policyAsset: string; scope: ReferenceScope },
): ConfirmationModel {
	const summary = intentOf(action, input.scope);

	return {
		account: computed(input.accountLabel),
		action: fromDapp(review.action),
		covenants: review.covenants.map((found) => ({
			address:
				found.verified === "matches-chain" ? verified(found.address) : computed(found.address),
			cmr: computed(found.cmr),
			tapleafHash: computed(found.tapleafHash),
			utxoType: fromDapp(found.utxoType),
			verified: computed(found.verified === "matches-chain"),
		})),
		feeAsset: computed(input.policyAsset.trim().toLowerCase()),
		feeSats: computed(review.estimatedFeeSats),
		blindedAmounts: blindedAmounts(review),
		netEffect: review.movements.map((movement) => ({
			asset: computed(movement.asset),
			sats: computed(movement.sats),
		})),
		protocol: fromDapp(manifest.protocol ?? ""),
		publishedAmounts: publishedAmounts(review),
		...(summary === undefined ? {} : { summary: fromDapp(summary) }),
	};
}

function blindedAmounts(review: ReviewedPlan): BlindedAmount[] {
	const blinded = review.outputs
		.filter((output) => output.blinded)
		.map((output) => ({
			decidedBy: computed(word(output.decidedBy)),
			id: fromDapp(output.id),
		}));

	return review.changeBlindedBy === undefined
		? blinded
		: [...blinded, { decidedBy: computed(word(review.changeBlindedBy)), id: computed("change") }];
}

function publishedAmounts(review: ReviewedPlan): PublishedAmount[] {
	const published = review.outputs
		.filter((output) => output.overrode !== undefined)
		.map((output) => ({
			id: fromDapp(output.id),
			reason: computed(describePublishedChange(output.overrode)),
		}));

	return review.changeOverrode === undefined
		? published
		: [
				...published,
				{
					id: computed("change"),
					reason: computed(describePublishedChange(review.changeOverrode)),
				},
			];
}

function word(decidedBy: BlindingDecision["decidedBy"] | undefined): string {
	return describeBlinding({ blinding: "blinded", decidedBy: decidedBy ?? "chain" });
}

export function describeOrigin(origin: Origin): string {
	switch (origin) {
		case "chain": {
			return "read from the network";
		}

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

function intentOf(action: Action, scope: ReferenceScope): string | undefined {
	const intent = action.node.intent;

	return typeof intent === "string"
		? intent.replaceAll(/\{(?<ref>[^{}:]+)(?::[^{}]*)?\}/g, (text, ref: string) => {
				const found = Refusal.attempt(() => resolveReference(ref, "expression", scope));

				return found === undefined ? text : String(found.value);
			})
		: undefined;
}

export type ShownConfirmation = Omit<ConfirmationModel, "feeSats" | "netEffect"> & {
	feeSats: Provenanced<string>;
	netEffect: { asset: Provenanced<string>; sats: Provenanced<string> }[];
};

export function toShownConfirmation(model: ConfirmationModel): ShownConfirmation {
	return {
		...model,
		feeSats: map(model.feeSats, (sats) => sats.toString()),
		netEffect: model.netEffect.map((effect) => ({
			asset: effect.asset,
			sats: map(effect.sats, (sats) => sats.toString()),
		})),
	};
}
