import { WalletRpcMethodNotFoundError } from "./errors";
import type { WalletRpcDispatcher, WalletRpcMethodMap, WalletRpcRequest } from "./types";

export function createWalletRpcDispatcher<Context>(
	handlers: WalletRpcMethodMap<Context>,
): WalletRpcDispatcher<Context> {
	const methods = Object.keys(handlers).toSorted();

	return {
		dispatch: async (request: WalletRpcRequest, context: Context) => {
			const handler = handlers[request.method];

			if (!handler) {
				throw new WalletRpcMethodNotFoundError(request.method);
			}

			return handler(request.params, context);
		},
		methods,
	};
}
