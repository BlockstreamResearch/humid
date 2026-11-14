import { statedAsset } from "../document/asset";
import type { Action } from "../document/manifest";
import { Refusal } from "../refusal";
import type { Scope } from "../values/scope";
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
	scope: Scope;
};

export function resolveAsset(declared: string | undefined, at: string, context: Context): string {
	const { policyAsset } = context;

	if (declared === undefined) {
		return policyAsset;
	}

	const stated = statedAsset(declared, policyAsset);

	if (stated.kind === "network") {
		return policyAsset;
	}

	if (stated.kind === "identified") {
		return stated.id;
	}

	const found = Refusal.amend(
		() => context.scope.reference(stated.reference, "asset"),
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

	const resolved = statedAsset(found, policyAsset);

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

	for (const input of action.inputs) {
		const asset = resolveAsset(input.asset, `input ${input.label}`, context);

		entryFor(asset);

		if (input.utxo_source === "wallet") {
			walletInputs.push({ asset, id: input.label });

			continue;
		}

		const held = heldById.get(input.label);

		if (input.asset !== undefined && held && held.asset !== asset) {
			throw new Refusal(
				`${action.name} says input ${input.label} is in ${asset}, and the output it spends ` +
					`holds ${held.asset}.`,
				"foreign-asset",
			);
		}
	}

	for (const [at, declared] of action.outputs.entries()) {
		const output = planned[at];

		if (!output) {
			continue;
		}

		const asset = resolveAsset(declared.asset, `output ${declared.label}`, context);
		const entry = entryFor(asset);

		outputs.push(asset);

		if (output.target.kind === "change") {
			if (entry.change) {
				if (declared.required_index === undefined && !positionedChange.has(asset)) {
					continue;
				}

				throw new Refusal(
					`${action.name} declares change for ${asset} twice, at ${entry.change.id} and ` +
						`${declared.label}. One surplus cannot go to two places, and this wallet will ` +
						"not choose between them.",
				);
			}

			entry.change = { blinded: output.blinding.blinding === "blinded", id: declared.label };

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
