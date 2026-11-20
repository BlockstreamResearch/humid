import {
	type Caip25CreateSessionResult,
	type Caip25GetSessionResult,
	HUMID_METHOD_POLICY_PROPERTY,
} from "@humid/wallet-rpc";

export type MethodPolicy = Record<string, boolean>;

export function readMethodPolicy(
	result: Caip25CreateSessionResult | Caip25GetSessionResult,
	chainId: string,
): MethodPolicy {
	const raw = result.scopedProperties?.[chainId]?.[HUMID_METHOD_POLICY_PROPERTY];
	if (typeof raw !== "object" || raw === null) return {};

	const policy: MethodPolicy = {};
	for (const [method, silent] of Object.entries(raw)) {
		if (typeof silent === "boolean") policy[method] = silent;
	}

	return policy;
}
