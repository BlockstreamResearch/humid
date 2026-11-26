import { CAIP25_METHODS } from "@/core/caip25";

import type { DappAuthorization } from "../dapp-authorization";
import type { PageRequestHandler } from "../page-port";

export function createInjectedRpcHandlers(
	authorization: DappAuthorization,
): Record<string, PageRequestHandler> {
	return {
		[CAIP25_METHODS.addChain]: async (params, origin) => authorization.addChain({ origin, params }),
		[CAIP25_METHODS.createSession]: async (params, origin) =>
			authorization.createSession({ origin, params }),
		[CAIP25_METHODS.getSession]: async (_params, origin) => authorization.getSession({ origin }),
		[CAIP25_METHODS.invokeMethod]: async (params, origin) =>
			authorization.invokeMethod({ origin, params }),
		[CAIP25_METHODS.revokeSession]: async (_params, origin) =>
			authorization.revokeSession({ origin }),
		[CAIP25_METHODS.switchChain]: async (params, origin) =>
			authorization.switchChain({ origin, params }),
	};
}
