import { isHash } from "../chain/hex";
import { parseReference } from "./references";

export type StatedAsset =
	| { kind: "deferred"; reference: string }
	| { kind: "identified"; id: string }
	| { kind: "network" };

const NETWORK_ASSET = "lbtc";

export function statedAsset(declared: string, policyAsset: string): StatedAsset {
	const text = declared.trim();
	const lowered = text.toLowerCase();

	if (lowered === NETWORK_ASSET || lowered === policyAsset) {
		return { kind: "network" };
	}

	if (isHash(lowered)) {
		return { id: lowered, kind: "identified" };
	}

	return parseReference(text)
		? { kind: "deferred", reference: text }
		: { id: text, kind: "identified" };
}
