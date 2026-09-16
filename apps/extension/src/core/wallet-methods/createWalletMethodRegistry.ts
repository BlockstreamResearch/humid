import { createWalletRpcDispatcher } from "@/core/wallet-rpc/dispatcher";
import type {
	WalletRpcBaseContext,
	WalletRpcDispatcher,
	WalletRpcMethodMap,
} from "@/core/wallet-rpc/types";

import type { WalletMethod } from "./createWalletMethod";

export type AnyWalletMethod<TContext extends WalletRpcBaseContext> = WalletMethod<
	TContext,
	unknown
>;

export type WalletMethodRegistry<TDispatchContext> = WalletRpcDispatcher<TDispatchContext>;

export function createWalletMethodRegistry<
	TDispatchContext,
	TMethodContext extends WalletRpcBaseContext,
>(
	methods: ReadonlyArray<AnyWalletMethod<TMethodContext>>,
	injectContext: (context: TDispatchContext) => TMethodContext,
): WalletMethodRegistry<TDispatchContext> {
	const handlers: WalletRpcMethodMap<TDispatchContext> = {};

	for (const method of methods) {
		if (!method.id) {
			throw new Error("A registered wallet method is missing its id.");
		}

		handlers[method.id] = (params, context) => method(params, injectContext(context));
	}

	return createWalletRpcDispatcher<TDispatchContext>(handlers);
}
