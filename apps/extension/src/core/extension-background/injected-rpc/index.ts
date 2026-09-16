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
		[caip25Rpc.methods.addChain]: async (message, sender) =>
			authorization.addChain({
				origin: await resolveSenderOrigin(sender),
				params: paramsOf(message),
			}),
		[caip25Rpc.methods.switchChain]: async (message, sender) =>
			authorization.switchChain({
				origin: await resolveSenderOrigin(sender),
				params: paramsOf(message),
			}),
	};
}
