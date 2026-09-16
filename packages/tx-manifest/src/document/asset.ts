import { parseReference } from "./references";

export type StatedAsset =
	| { kind: "deferred"; reference: string }
	| { kind: "identified"; id: string }
	| { kind: "network" };

const NETWORK_ASSET = "lbtc";

const ASSET_ID = /^[0-9a-f]{64}$/;

export function statedAsset(declared: string, policyAsset: string): StatedAsset {
	const text = declared.trim();
	const lowered = text.toLowerCase();

	if (lowered === NETWORK_ASSET || lowered === policyAsset.trim().toLowerCase()) {
		return { kind: "network" };
	}

	if (ASSET_ID.test(lowered)) {
		return { id: lowered, kind: "identified" };
	}

	return parseReference(text)
		? { kind: "deferred", reference: text }
		: { id: text, kind: "identified" };
}
