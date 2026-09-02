import { asRecord } from "../document/json";
import type { NormalisedAction, NormalisedManifest } from "../document/normalise";
import {
	type BlindingDecision,
	describeBlinding,
	describePublishedChange,
} from "../evaluation/blinding";
import type { ManifestReview } from "../review";
import { computed, fromSite, map, type Origin, type Provenanced, verified } from "./provenance";

/** One asset's movement in or out of the wallet, as a person would read it. */
export type NetEffect = {
	/** The asset moving, by the id the chain knows it as. */
	asset: Provenanced<string>;
	/** Base units, negative when the wallet is paying out. */
	sats: Provenanced<bigint>;
};

/**
 * One amount this transaction keeps off the chain, and whose word decided that.
 *
 * A person approving an action is agreeing to what it moves and to how much of that is
 * published. The second half was decided while the document was read and then went nowhere:
 * the builder needs only a yes or no, so the word behind it was worked out and dropped. Which
 * left the wallet hiding amounts on someone's behalf without ever saying so, and unable to
 * tell them apart — a protocol that asked, and a protocol that said nothing where this
 * network's own answer is to hide.
 */
export type HiddenAmount = {
	/** Whose word decided it, in a person's own terms rather than the format's. */
	decidedBy: Provenanced<string>;
	/** What the protocol calls this output. Its own word, so its own provenance. */
	id: Provenanced<string>;
};

/**
 * One amount this transaction publishes that the format would have kept off the chain.
 *
 * There is one rule that produces these and it applies to one thing: a contract action's own
 * change. The wallet publishes it so the money returns in a form the next action can be funded
 * from, and publishing it is a deviation from the format rather than an application of it.
 *
 * Which is exactly why it is on the screen. A person has already been told whose word decided
 * each amount the wallet hid; a wallet that then quietly overrode a protocol, in the one place
 * that person was told to trust its reading, would have made that first sentence worth less.
 */
export type PublishedAmount = {
	/** What the protocol calls this output, or the wallet's own name for its change. */
	id: Provenanced<string>;
	/** The word that was set aside and what publishing bought, in a person's own terms. */
	reason: Provenanced<string>;
};

/** One covenant the action touches, and what the wallet established about it. */
export type CovenantRow = {
	address: Provenanced<string>;
	/** What kind of UTXO the protocol calls it. Its own word, so its own provenance. */
	utxoType: Provenanced<string>;
	/** Whether the wallet compared this address against where the funds actually sit. */
	verified: Provenanced<boolean>;
};

/**
 * Everything the person is shown before they decide, and where each part came from.
 *
 * Every field is provenanced, which is not decoration: a plain value cannot be assigned to
 * one of these, so a value whose origin nobody established cannot reach this surface at all.
 * That is the difference between a rule and a type.
 *
 * What the wallet established for itself and what the site merely said sit in the same
 * object deliberately. Separating them into two screens would let a reader assume the first
 * screen is all that matters; keeping them together with their origins attached is what
 * makes the comparison possible.
 */
export type ConfirmationModel = {
	/** Which account is acting. Implicit in the wallet's own selection, so it is shown. */
	account: Provenanced<string>;
	/** The action's name, as the manifest spells it. */
	action: Provenanced<string>;
	covenants: CovenantRow[];
	/**
	 * The asset the network charges its fee in, which is the one asset it can be charged in.
	 *
	 * Shown so the surface can tell the row it knows how to write from the rows it does not: a
	 * wallet knows what the network's own asset is called and how it is divided, and knows
	 * neither of those about a token a protocol invented. Printing a token's units under the
	 * network asset's name is the failure this prevents, and it is the failure a single-asset
	 * screen could not have.
	 */
	feeAsset: Provenanced<string>;
	/** What the wallet worked out this will cost, which is not the figure that gets charged. */
	feeSats: Provenanced<bigint>;
	/** Every amount this transaction hides, each with whose word decided that. */
	hiddenAmounts: HiddenAmount[];
	/** The wallet's own balance change per asset — the authoritative figure. */
	netEffect: NetEffect[];
	/** The protocol's name, which is the site's word for itself. */
	protocol: Provenanced<string>;
	/** Every amount this wallet published over the format's word, each saying which word. */
	publishedAmounts: PublishedAmount[];
	/** The protocol's own one-line summary, when it wrote one. Site text, always. */
	summary?: Provenanced<string>;
};

/**
 * The plan this model is a reading of: everything the review established except this.
 *
 * Stated as what it excludes rather than as a shape of its own, so a field added to the review
 * is readable here without being named twice — and so that nothing has to invent an empty model
 * to stand in for one that has not been built yet.
 */
export type ReviewedPlan = Omit<ManifestReview, "confirmation">;

/**
 * Builds what the person sees from what the wallet established.
 *
 * The net effect is the wallet's own balance change rather than the manifest's declared
 * amounts, and there is one of them per asset. A covenant input the wallet does not own is not
 * part of that change directly; it appears as its own row, which is what the reference
 * implementation does and for the same reason — the declared amounts are the site's account of
 * the transaction, and the balance change is what actually happens to this person.
 */
export function confirmationModel(
	review: ReviewedPlan,
	manifest: NormalisedManifest,
	action: NormalisedAction,
	input: { accountLabel: string; policyAsset: string },
): ConfirmationModel {
	const summary = actionSummary(action);

	return {
		account: computed(input.accountLabel),
		action: fromSite(review.action),
		covenants: review.covenants.map((found) => ({
			address:
				found.verified === "matches-chain" ? verified(found.address) : computed(found.address),
			utxoType: fromSite(found.utxoType),
			verified: computed(found.verified === "matches-chain"),
		})),
		feeAsset: computed(input.policyAsset.trim().toLowerCase()),
		// Computed rather than chain-read: it is the wallet's own estimate of a figure the
		// network will settle, and calling it anything stronger would overstate it.
		feeSats: computed(review.estimatedFeeSats),
		hiddenAmounts: hiddenAmounts(review),
		// One line per asset the action moves, and no line that adds two of them together. A
		// transaction swapping a token for money changes this wallet's balance in two directions
		// at once, and a single figure can only say one of them — which is why what was here
		// before could report a payout for an action that pays this wallet.
		netEffect: review.movements.map((movement) => ({
			asset: computed(movement.asset),
			sats: computed(movement.sats),
		})),
		protocol: fromSite(manifest.protocol ?? ""),
		publishedAmounts: publishedAmounts(review),
		...(summary === undefined ? {} : { summary: fromSite(summary) }),
	};
}

/**
 * Every amount this action keeps off the chain.
 *
 * Change is not among them and no longer can be: the wallet publishes a contract action's own
 * change so it comes back spendable, and says so on the list below instead. It was on this list
 * until then, for the reason a person is least likely to have expected — the usual thing a
 * document says about its change is nothing, and on this network that silence means hidden.
 *
 * The sentence is the wallet's own reading of the document, so it is computed; the name beside
 * it is the protocol's word for the output, so it is the site's. That split is the point: the
 * word "hidden" here was established by this wallet, and what is being hidden was not.
 */
function hiddenAmounts(review: ReviewedPlan): HiddenAmount[] {
	return review.outputs
		.filter((output) => output.blinded)
		.map((output) => ({
			decidedBy: computed(word(output.decidedBy)),
			id: fromSite(output.id),
		}));
}

/**
 * Every amount this wallet published where the format would have hidden it.
 *
 * A contract action's own change and nothing else, which is the whole of the deviation. An
 * action's change in a token the wallet builds itself comes first under the document's own name
 * for it; the network asset's change comes last and is named rather than given a document's id,
 * because the module appends that one and the wallet would be inventing a name.
 *
 * Empty when a protocol asked for its change in the open itself. Then the wallet overrode
 * nothing and has nothing to answer for.
 */
function publishedAmounts(review: ReviewedPlan): PublishedAmount[] {
	const published = review.outputs
		.filter((output) => output.overrode !== undefined)
		.map((output) => ({
			id: fromSite(output.id),
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

/** The sentence for one decision, which is the refusal's sentence and for the same reason. */
function word(decidedBy: BlindingDecision["decidedBy"] | undefined): string {
	return describeBlinding({ blinding: "hidden", decidedBy: decidedBy ?? "chain" });
}

/**
 * What a person is told about a value's origin, in their own terms.
 *
 * The site's word is the one that has to be unmistakable, so it is the one stated plainly
 * rather than left to a badge nobody reads.
 */
export function describeOrigin(origin: Origin): string {
	switch (origin) {
		case "chain": {
			return "read from the network";
		}

		case "computed": {
			return "worked out by this wallet";
		}

		case "site": {
			return "claimed by the site";
		}

		default: {
			return "checked by this wallet against the network";
		}
	}
}

/** The protocol's own one-line summary of the action, when its display metadata carries one. */
function actionSummary(action: NormalisedAction): string | undefined {
	const declared = asRecord(action.node.ui)?.action ?? action.node.description;

	return typeof declared === "string" ? declared : undefined;
}

/**
 * The same model with every amount as a decimal string.
 *
 * It exists because the confirmation crosses the extension's message bus, which
 * serializes as JSON, and JSON has no bigint — `JSON.stringify` throws on one rather
 * than losing it. Amounts stay bigint everywhere they are computed and become strings
 * only at that boundary, which is the one place the loss is a formatting concern rather
 * than an arithmetic one.
 */
export type ShownConfirmation = Omit<ConfirmationModel, "feeSats" | "netEffect"> & {
	feeSats: Provenanced<string>;
	netEffect: { asset: Provenanced<string>; sats: Provenanced<string> }[];
};

/** Prepares the model to cross a boundary that cannot carry a bigint. */
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
