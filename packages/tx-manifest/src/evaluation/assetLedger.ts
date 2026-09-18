import { statedAsset } from "../document/asset";
import { asArray, asRecord } from "../document/json";
import type { NormalisationNote, NormalisedAction } from "../document/normalise";
import { type ReferenceScope, resolveReference } from "../document/references";
import type { PlannedOutput } from "./plan";

export type AssetEntry = {
	asset: string;
	change?: { blinded: boolean; id: string };
	held: bigint;
	needed: bigint;
};

export type AssetLedger = {
	entries: AssetEntry[];
	outputs: string[];
	walletInputs: { asset: string; id: string }[];
};

export type AssetLedgerResult =
	| { ok: false; reason: string; reject: "document-fault" | "foreign-asset" }
	| { ok: true; ledger: AssetLedger };

export type HeldValue = {
	asset: string;
	created?: true;
	id: string;
	sats: bigint;
};

type Context = {
	notes?: NormalisationNote[];
	policyAsset: string;
	scope: ReferenceScope;
};

export type AssetResolution = { ok: false; reason: string } | { ok: true; id: string };

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

	const found = resolveReference(stated.reference, "asset", context.scope);

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

	entryFor(context.policyAsset.trim().toLowerCase());

	const walletInputs: { asset: string; id: string }[] = [];
	const outputs: string[] = [];
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
			if (entry.change) {
				return {
					ok: false,
					reason:
						`${action.name} declares change for ${resolved.id} twice, at ` +
						`${entry.change.id || "(unnamed)"} and ${id || "(unnamed)"}. One surplus cannot ` +
						"go to two places, and this wallet will not choose between them.",
					reject: "document-fault",
				};
			}

			entry.change = { blinded: output.blinding.blinding === "blinded", id };

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
