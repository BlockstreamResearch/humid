import { asRecord } from "../document/json";
import type { NormalisedAction, NormalisedManifest } from "../document/normalise";
import type { ManifestReview } from "../review";
import { computed, fromSite, map, type Origin, type Provenanced, verified } from "./provenance";

/** One asset's movement in or out of the wallet, as a person would read it. */
export type NetEffect = {
	/** The asset moving, by the id the chain knows it as. */
	asset: Provenanced<string>;
	/** Base units, negative when the wallet is paying out. */
	sats: Provenanced<bigint>;
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
	/** What the wallet worked out this will cost, which is not the figure that gets charged. */
	feeSats: Provenanced<bigint>;
	/** The wallet's own balance change per asset — the authoritative figure. */
	netEffect: NetEffect[];
	/** The protocol's name, which is the site's word for itself. */
	protocol: Provenanced<string>;
	/** The protocol's own one-line summary, when it wrote one. Site text, always. */
	summary?: Provenanced<string>;
};

/**
 * Builds what the person sees from what the wallet established.
 *
 * The net effect is the wallet's own balance change rather than the manifest's declared
 * amounts. A covenant input the wallet does not own is not part of that change and is not
 * counted into it; those appear as their own rows, which is what the reference
 * implementation does and for the same reason — the declared amounts are the site's account
 * of the transaction, and the balance change is what actually happens to this person.
 */
export function confirmationModel(
	review: ManifestReview,
	manifest: NormalisedManifest,
	action: NormalisedAction,
	input: { accountLabel: string; policyAsset: string },
): ConfirmationModel {
	const paid = review.outputs.reduce((total, output) => total + output.sats, 0n);
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
		// Computed rather than chain-read: it is the wallet's own estimate of a figure the
		// network will settle, and calling it anything stronger would overstate it.
		feeSats: computed(review.estimatedFeeSats),
		netEffect: [
			{
				asset: computed(input.policyAsset),
				// Negative: everything the action pays out leaves this wallet, and the fee with it.
				sats: computed(-(paid + review.estimatedFeeSats)),
			},
		],
		protocol: fromSite(manifest.protocol ?? ""),
		...(summary === undefined ? {} : { summary: fromSite(summary) }),
	};
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
