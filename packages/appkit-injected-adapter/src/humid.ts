import { InjectedCaipAdapter } from "./adapter";
import {
	LIQUID_DESCRIPTOR_CHANGED_EVENT,
	LIQUID_NAMESPACE,
	liquidNetworks,
	liquidWalletRpcMethods,
} from "./liquid";
import type { LiquidGetBalanceResult } from "./liquid-rpc";
import { readMethodPolicy } from "./policy";
import type {
	InjectedCaipAdapterOptions,
	RawInjectedProvider,
	ReadBalanceContext,
	SignMessageContext,
} from "./types";

declare global {
	interface Window {
		humid?: RawInjectedProvider;
	}
}

export const HUMID_CONNECTOR = {
	id: "humid",
	name: "Humid Extension",
	rdns: "app.humid.extension",
};

async function humidSignMessage(context: SignMessageContext): Promise<{ signature: string }> {
	if (context.address === context.accountId) {
		throw new Error(
			"AppKit signs as the account id, which names a Humid wallet rather than a Liquid address. " +
				"Call the wallet's signMessage with an address from getAddress or getUTXOs.",
		);
	}

	const result = await context.invoke<{ signature: string } | string>(
		context.scope,
		"signMessage",
		{ address: context.address, message: context.message, protocol: "ecdsa" },
	);

	return { signature: typeof result === "string" ? result : result.signature };
}

async function humidReadBalance({
	invoke,
	scope,
	session,
}: ReadBalanceContext): Promise<bigint | undefined> {
	if (readMethodPolicy(session, scope).getBalance !== true) return undefined;

	const { balance } = await invoke<LiquidGetBalanceResult>(scope, "getBalance");

	return BigInt(balance);
}

export type HumidAdapterOptions = Partial<InjectedCaipAdapterOptions>;

export class HumidAdapter extends InjectedCaipAdapter {
	constructor(overrides: HumidAdapterOptions = {}) {
		super({
			namespace: LIQUID_NAMESPACE,
			connector: HUMID_CONNECTOR,
			getProvider: () => window.humid,
			methods: liquidWalletRpcMethods,
			notifications: [LIQUID_DESCRIPTOR_CHANGED_EVENT],
			networks: liquidNetworks,
			readBalance: humidReadBalance,
			signMessage: humidSignMessage,
			...overrides,
		});
	}
}
