import { statedAsset } from "../document/asset";
import { asArray, asRecord } from "../document/json";
import type { Action } from "../document/manifest";
import { type ReferenceScope, resolveReference } from "../document/references";
import { Refusal } from "../refusal";
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

export type HeldValue = {
	asset: string;
	created?: true;
	id: string;
	sats: bigint;
};

type Context = {
	policyAsset: string;
	scope: ReferenceScope;
};

export function resolveAsset(declared: unknown, at: string, context: Context): string {
	const policyAsset = context.policyAsset;

	if (declared === undefined) {
		return policyAsset;
	}

	if (typeof declared !== "string") {
		throw new Refusal(`The asset at ${at} is not written as text.`, "foreign-asset");
	}

	const stated = statedAsset(declared, context.policyAsset);

	if (stated.kind === "network") {
		return policyAsset;
	}

	if (stated.kind === "identified") {
		return stated.id;
	}

	const found = Refusal.amend(
		() => resolveReference(stated.reference, "asset", context.scope),
		(reason) =>
			`The asset at ${at} is stated as ${stated.reference}, and this wallet could not ` +
			`establish what that is: ${reason}`,
		"foreign-asset",
	);

	if (typeof found !== "string") {
		throw new Refusal(
			`The asset at ${at} is stated as ${stated.reference}, which resolved to something ` +
				"that is not an asset id.",
			"foreign-asset",
		);
	}

	const resolved = statedAsset(found, context.policyAsset);

	if (resolved.kind === "deferred") {
		throw new Refusal(
			`The asset at ${at} is stated as ${stated.reference}, which resolved to ` +
				`${found} — another lookup rather than an asset.`,
			"foreign-asset",
		);
	}

	return resolved.kind === "network" ? policyAsset : resolved.id;
}

export function assetLedger(
	action: Action,
	planned: PlannedOutput[],
	context: Context & { held: HeldValue[] },
): AssetLedger {
	const declaredOutputs = asArray(action.node.outputs)
		.map((entry) => asRecord(entry))
		.filter((entry) => entry !== undefined);

	if (declaredOutputs.length !== planned.length) {
		throw new Refusal(
			`${action.name} plans ${planned.length} outputs against ${declaredOutputs.length} ` +
				"declared ones, so this wallet cannot say which asset each one pays in.",
		);
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

	entryFor(context.policyAsset);

	const walletInputs: { asset: string; id: string }[] = [];
	const outputs: string[] = [];
	const positionedChange = new Set<string>();
	const heldById = new Map(
		context.held.filter((value) => value.created !== true).map((value) => [value.id, value]),
	);

	for (const entry of asArray(action.node.inputs)) {
		const declared = asRecord(entry);

		if (!declared) {
			continue;
		}

		const id = typeof declared.id === "string" ? declared.id : "(unnamed)";
		const asset = resolveAsset(declared.asset, `input ${id}`, context);

		entryFor(asset);

		if (typeof asRecord(declared.utxo_source)?.utxo_type === "string") {
			const held = heldById.get(id);

			if (declared.asset !== undefined && held && held.asset !== asset) {
				throw new Refusal(
					`${action.name} says input ${id} is in ${asset}, and the output it spends ` +
						`holds ${held.asset}.`,
					"foreign-asset",
				);
			}

			continue;
		}

		walletInputs.push({ asset, id });
	}

	for (const [at, declared] of declaredOutputs.entries()) {
		const output = planned[at];

		if (!output) {
			continue;
		}

		const id = typeof declared.id === "string" ? declared.id : "";

		if (id !== output.id) {
			throw new Refusal(
				`${action.name} declares ${id || "(unnamed)"} where its plan has ` +
					`${output.id || "(unnamed)"}, so this wallet cannot say which asset that output ` +
					"pays in.",
			);
		}

		const asset = resolveAsset(declared.asset, `output ${id || "(unnamed)"}`, context);
		const entry = entryFor(asset);

		outputs.push(asset);

		if (output.target.kind === "change") {
			if (entry.change) {
				if (declared.required_index === undefined && !positionedChange.has(asset)) {
					continue;
				}

				throw new Refusal(
					`${action.name} declares change for ${asset} twice, at ` +
						`${entry.change.id || "(unnamed)"} and ${id || "(unnamed)"}. One surplus cannot ` +
						"go to two places, and this wallet will not choose between them.",
				);
			}

			entry.change = { blinded: output.blinding.blinding === "blinded", id };

			if (declared.required_index !== undefined) {
				positionedChange.add(asset);
			}

			continue;
		}

		entry.needed += output.sats ?? 0n;
	}

	for (const value of context.held) {
		entryFor(value.asset).held += value.sats;
	}

	return { entries: [...entries.values()], outputs, walletInputs };
}
