import { createWalletRpcDispatcher } from "@/core/wallet-rpc/dispatcher";
import type {
	WalletRpcBaseContext,
	WalletRpcDispatcher,
	WalletRpcMethodMap,
} from "@/core/wallet-rpc/types";

import { toWalletCapabilityDescriptor, type WalletCapabilityDescriptor } from "./capability";
import type { WalletMethod } from "./createWalletMethod";

/**
 * A wrapped wallet method as stored in a registry, with params/result erased to the
 * dynamic dispatch boundary. `any` in the params slot keeps a concrete method
 * assignable and its `restricted` stub callable with raw request params; the typed
 * definition at the call site is unaffected — the erasure is local to the registry.
 */
// oxlint-disable-next-line no-explicit-any -- deliberate erasure at the dispatch boundary
export type AnyWalletMethod<TContext extends WalletRpcBaseContext> = WalletMethod<
	any,
	TContext,
	unknown
>;

/**
 * The single source of truth for a chain's dapp RPC surface: a JSON-RPC dispatcher
 * plus the connect-time capability descriptors, both derived from one method list.
 */
export type WalletMethodRegistry<TDispatchContext> = WalletRpcDispatcher<TDispatchContext> & {
	capabilities: WalletCapabilityDescriptor[];
	getCapability: (method: string) => WalletCapabilityDescriptor | undefined;
};

/**
 * Builds a {@link WalletMethodRegistry} from one list of wrapped methods, deriving
 * the dispatcher, the advertised method names (`registry.methods`), and the
 * connect-time capabilities from that single list — so adding or removing a method
 * is a one-line edit with nothing else to keep in sync.
 *
 * `injectContext` adapts the dispatcher's public context into the shared method
 * context (e.g. injecting a chain's backends), keeping those internals off callers.
 * Throws if a listed method is missing its capability descriptor.
 */
export function createWalletMethodRegistry<
	TDispatchContext,
	TMethodContext extends WalletRpcBaseContext,
>(
	methods: ReadonlyArray<AnyWalletMethod<TMethodContext>>,
	injectContext: (context: TDispatchContext) => TMethodContext,
): WalletMethodRegistry<TDispatchContext> {
	const handlers: WalletRpcMethodMap<TDispatchContext> = {};
	const capabilities: WalletCapabilityDescriptor[] = [];
	const byMethod = new Map<string, WalletCapabilityDescriptor>();

	for (const method of methods) {
		const { capability } = method;

		if (!capability) {
			throw new Error("A registered wallet method is missing its capability descriptor.");
		}

		handlers[capability.id] = (params, context) => method(params, injectContext(context));

		const descriptor = toWalletCapabilityDescriptor(capability);
		capabilities.push(descriptor);
		byMethod.set(descriptor.id, descriptor);
	}

	return {
		...createWalletRpcDispatcher<TDispatchContext>(handlers),
		capabilities,
		getCapability: (method) => byMethod.get(method),
	};
}
