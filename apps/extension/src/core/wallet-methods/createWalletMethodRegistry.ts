import { createWalletRpcDispatcher } from "@/core/wallet-rpc/dispatcher";
import type {
	WalletRpcBaseContext,
	WalletRpcDispatcher,
	WalletRpcMethodMap,
} from "@/core/wallet-rpc/types";

import type { WalletMethod } from "./createWalletMethod";

/**
 * A wrapped wallet method as stored in a registry, with its result erased to the dynamic
 * dispatch boundary; the typed definition at the call site is unaffected.
 */
export type AnyWalletMethod<TContext extends WalletRpcBaseContext> = WalletMethod<
	TContext,
	unknown
>;

/**
 * The single source of truth for a chain's dapp RPC surface: a JSON-RPC dispatcher derived
 * from one method list.
 */
export type WalletMethodRegistry<TDispatchContext> = WalletRpcDispatcher<TDispatchContext>;

/**
 * Builds a {@link WalletMethodRegistry} from one list of wrapped methods, deriving the
 * dispatcher and the advertised method names (`registry.methods`) from that single list —
 * so adding or removing a method is a one-line edit with nothing else to keep in sync.
 *
 * `injectContext` adapts the dispatcher's public context into the shared method context
 * (e.g. injecting a chain's backends), keeping those internals off callers.
 * Throws if a listed method is missing its id.
 */
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
