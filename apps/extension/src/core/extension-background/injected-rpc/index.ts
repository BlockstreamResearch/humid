import { CAIP25_METHODS } from "@/core/caip25";
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
		[CAIP25_METHODS.createSession]: async (message, sender) =>
			authorization.createSession({
				origin: await resolveSenderOrigin(sender),
				params: paramsOf(message),
			}),
		[CAIP25_METHODS.getSession]: async (_message, sender) =>
			authorization.getSession({ origin: await resolveSenderOrigin(sender) }),
		[CAIP25_METHODS.revokeSession]: async (_message, sender) =>
			authorization.revokeSession({ origin: await resolveSenderOrigin(sender) }),
		[CAIP25_METHODS.invokeMethod]: async (message, sender) =>
			authorization.invokeMethod({
				origin: await resolveSenderOrigin(sender),
				params: paramsOf(message),
			}),
		[CAIP25_METHODS.addChain]: async (message, sender) =>
			authorization.addChain({
				origin: await resolveSenderOrigin(sender),
				params: paramsOf(message),
			}),
		[CAIP25_METHODS.switchChain]: async (message, sender) =>
			authorization.switchChain({
				origin: await resolveSenderOrigin(sender),
				params: paramsOf(message),
			}),
	};
}
