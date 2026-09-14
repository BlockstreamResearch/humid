import { statedAsset } from "../document/asset";
import { asArray, asRecord } from "../document/json";
import type { NormalisationNote, NormalisedAction } from "../document/normalise";
import { type ReferenceScope, resolveReference } from "../document/references";
import type { PlannedOutput } from "./plan";

/**
 * What one asset costs this transaction, and what the transaction already brings in it.
 *
 * One of these per asset, rather than one number for the whole transaction. A single running
 * total is only sound while there is a single asset: added together, three units of a
 * one-of-a-kind token and three thousand base units of money make six of nothing, and a wallet
 * that funds six of nothing is a wallet that funds neither.
 */
export type AssetEntry = {
	/** The asset id, as the chain writes it. */
	asset: string;
	/**
	 * The declared output this asset's surplus returns to, when the document declares one.
	 *
	 * Only the asset the network charges its fees in can be left to the signing module, because
	 * only that one has a fee taken out of it and therefore an amount nobody knows until the
	 * transaction has been weighed. Every other asset's change is an exact figure, and an exact
	 * figure needs an output to land in.
	 */
	change?: { blinded: boolean; id: string };
	/**
	 * Base units this transaction already brings in this asset before the wallet adds any of
	 * its own: what the covenants it spends hold, and what its issuances create.
	 */
	held: bigint;
	/** Base units the action's outputs pay in this asset. Change is not counted; it has no amount. */
	needed: bigint;
};

/** Which asset each piece of an action is in, and what each of those assets needs. */
export type AssetLedger = {
	/** Every asset this action moves, in the order a person reading the document meets it. */
	entries: AssetEntry[];
	/** The asset of each planned output, in the plan's own order. */
	outputs: string[];
	/** Every input the wallet has to find for itself, in the order the action declares them. */
	walletInputs: { asset: string; id: string }[];
};

export type AssetLedgerResult =
	| { ok: false; reason: string; reject: "document-fault" | "foreign-asset" }
	| { ok: true; ledger: AssetLedger };

/** What this transaction brings in an asset without the wallet spending anything of its own. */
export type HeldValue = {
	asset: string;
	/**
	 * Whether the transaction creates these units rather than finding them at an outpoint.
	 *
	 * One input can bring both: a covenant holding one asset, spent on the path that mints
	 * another, arrives here twice under one id. Both are really in the transaction and both are
	 * counted — but only the first is what the input *spends*, and it is the only one the
	 * document's word about that input can be checked against.
	 */
	created?: true;
	/** The input this value arrives on, so a disagreement can name it. */
	id: string;
	sats: bigint;
};

type Context = {
	notes?: NormalisationNote[];
	policyAsset: string;
	scope: ReferenceScope;
};

export type AssetResolution = { ok: false; reason: string } | { ok: true; id: string };

/**
 * Which asset a declared `asset` field is, once the deployment and the request have been read.
 *
 * The corpus states an asset as a lookup far more often than as an id — every asset in every
 * published protocol, in fact — so this is where most of them first become a thing rather than
 * a spelling. A site that states none is stating the asset the network charges fees in: that is
 * the only asset a document can leave unsaid and still be understood by everyone reading it.
 */
export function resolveAsset(declared: unknown, at: string, context: Context): AssetResolution {
	if (declared === undefined) {
		return { id: context.policyAsset.trim().toLowerCase(), ok: true };
	}

	if (typeof declared !== "string") {
		return { ok: false, reason: `The asset at ${at} is not written as text.` };
	}

	const stated = statedAsset(declared, context.policyAsset);

	if (stated.kind === "network") {
		return { id: context.policyAsset.trim().toLowerCase(), ok: true };
	}

	if (stated.kind === "identified") {
		return { id: stated.id, ok: true };
	}

	const found = resolveReference(stated.reference, "asset", context.scope, context.notes);

	if (!found.ok) {
		return {
			ok: false,
			reason:
				`The asset at ${at} is stated as ${stated.reference}, and this wallet could not ` +
				`establish what that is: ${found.reason}`,
		};
	}

	if (typeof found.value !== "string") {
		return {
			ok: false,
			reason:
				`The asset at ${at} is stated as ${stated.reference}, which resolved to something ` +
				"that is not an asset id.",
		};
	}

	const resolved = statedAsset(found.value, context.policyAsset);

	if (resolved.kind === "deferred") {
		return {
			ok: false,
			reason:
				`The asset at ${at} is stated as ${stated.reference}, which resolved to ` +
				`${found.value} — another lookup rather than an asset.`,
		};
	}

	return {
		id: resolved.kind === "network" ? context.policyAsset.trim().toLowerCase() : resolved.id,
		ok: true,
	};
}

/**
 * Reads one action as a statement about several assets rather than about one amount.
 *
 * Everything here is a rule of the format: an output pays in the asset it states, an input
 * arrives in the asset it states, a covenant holds whatever the chain says it holds, and an
 * issuance creates what it declares. Nothing recognises a protocol, a deployment or a name.
 *
 * The plan is read positionally against the action's own outputs, which is exactly how the plan
 * was built — one planned output per declared record, in order. The ids are compared as well, so
 * a plan that ever stopped lining up is refused here rather than silently attributing an amount
 * to the wrong asset.
 */
export function assetLedger(
	action: NormalisedAction,
	planned: PlannedOutput[],
	context: Context & { held: HeldValue[] },
): AssetLedgerResult {
	const declaredOutputs = asArray(action.node.outputs)
		.map((entry) => asRecord(entry))
		.filter((entry) => entry !== undefined);

	if (declaredOutputs.length !== planned.length) {
		return {
			ok: false,
			reason:
				`${action.name} plans ${planned.length} outputs against ${declaredOutputs.length} ` +
				"declared ones, so this wallet cannot say which asset each one pays in.",
			reject: "document-fault",
		};
	}

	const entries = new Map<string, AssetEntry>();
	const entryFor = (asset: string): AssetEntry => {
		const existing = entries.get(asset);

		if (existing) {
			return existing;
		}

		const created: AssetEntry = { asset, held: 0n, needed: 0n };

		entries.set(asset, created);

		return created;
	};

	// The asset the network charges its fees in is always part of the reckoning, whether or not
	// the action mentions it: the fee is paid in it and the wallet pays the fee.
	entryFor(context.policyAsset.trim().toLowerCase());

	const walletInputs: { asset: string; id: string }[] = [];
	const outputs: string[] = [];
	// Only what the chain reports, keyed by the input it arrived on. An input that issues an
	// asset also reports one here, under the same id — and letting that win turns the check
	// below into a comparison of the document's word against the asset this very input just
	// created, which disagree for every covenant-sourced issuance and should.
	const heldById = new Map(
		context.held.filter((value) => value.created !== true).map((value) => [value.id, value]),
	);

	for (const entry of asArray(action.node.inputs)) {
		const declared = asRecord(entry);

		if (!declared) {
			continue;
		}

		const id = typeof declared.id === "string" ? declared.id : "(unnamed)";
		const resolved = resolveAsset(declared.asset, `input ${id}`, context);

		if (!resolved.ok) {
			return { ok: false, reason: resolved.reason, reject: "foreign-asset" };
		}

		entryFor(resolved.id);

		if (typeof asRecord(declared.utxo_source)?.utxo_type === "string") {
			// A covenant input's asset is whatever the chain says is at that outpoint. The document
			// states one too, and the two disagreeing means the covenant is not holding what the
			// action says it holds — which would fund the stated asset and strand the real one.
			const held = heldById.get(id);

			if (declared.asset !== undefined && held && held.asset !== resolved.id) {
				return {
					ok: false,
					reason:
						`${action.name} says input ${id} is in ${resolved.id}, and the output it spends ` +
						`holds ${held.asset}.`,
					reject: "foreign-asset",
				};
			}

			continue;
		}

		walletInputs.push({ asset: resolved.id, id });
	}

	for (const [at, declared] of declaredOutputs.entries()) {
		const output = planned[at];

		if (!output) {
			continue;
		}

		const id = typeof declared.id === "string" ? declared.id : "";

		if (id !== output.id) {
			return {
				ok: false,
				reason:
					`${action.name} declares ${id || "(unnamed)"} where its plan has ` +
					`${output.id || "(unnamed)"}, so this wallet cannot say which asset that output ` +
					"pays in.",
				reject: "document-fault",
			};
		}

		const resolved = resolveAsset(declared.asset, `output ${id || "(unnamed)"}`, context);

		if (!resolved.ok) {
			return { ok: false, reason: resolved.reason, reject: "foreign-asset" };
		}

		const entry = entryFor(resolved.id);

		outputs.push(resolved.id);

		if (output.target.kind === "change") {
			// The first one wins. A document declaring two change outputs for one asset is
			// declaring one place for its surplus twice, and splitting a surplus between them
			// would be the wallet deciding something the document did not say.
			entry.change ??= { blinded: output.blinding.blinding === "hidden", id };

			continue;
		}

		entry.needed += output.sats ?? 0n;
	}

	for (const value of context.held) {
		entryFor(value.asset).held += value.sats;
	}

	return {
		ledger: {
			entries: [...entries.values()],
			outputs,
			walletInputs,
		},
		ok: true,
	};
}
