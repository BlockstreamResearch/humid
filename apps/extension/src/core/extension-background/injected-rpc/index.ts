import { caip25Rpc } from "@/core/caip25";
import type { ExtensionMessage } from "@/helpers/background";

import type { DappAuthorization } from "../dapp-authorization";
import type { RequestHandlerMap } from "../transport";
import { resolveSenderOrigin } from "./resolveSenderOrigin";

type InjectedRpcMessage = ExtensionMessage & {
	params?: unknown;
};

export type CreateInjectedRpcHandlersInput = {
	authorization: DappAuthorization;
};

/**
 * Builds the injected (dapp-facing) handler map. The surface is CAIP-25 only:
 * dapps authorize with `wallet_createSession` and invoke chain methods through
 * `wallet_invokeMethod` (CAIP-27); raw chain methods are reachable only through
 * the authorization gate. Origin is resolved authentically per request.
 */
export function createInjectedRpcHandlers({
	authorization,
}: CreateInjectedRpcHandlersInput): RequestHandlerMap {
	const paramsOf = (message: ExtensionMessage): unknown =>
		(message as InjectedRpcMessage).params ?? message.data;

	return {
		[caip25Rpc.methods.createSession]: async (message, sender) =>
			authorization.createSession({
				origin: await resolveSenderOrigin(sender),
				params: paramsOf(message),
			}),
		[caip25Rpc.methods.getSession]: async (_message, sender) =>
			authorization.getSession({ origin: await resolveSenderOrigin(sender) }),
		[caip25Rpc.methods.revokeSession]: async (_message, sender) =>
			authorization.revokeSession({ origin: await resolveSenderOrigin(sender) }),
		[caip25Rpc.methods.invokeMethod]: async (message, sender) =>
			authorization.invokeMethod({
				origin: await resolveSenderOrigin(sender),
				params: paramsOf(message),
			}),
	};
}
