import { requestBackground } from "@/core/extension-rpc";

import { dappSessionsRpc, type ConnectedDappView, type DappSessionRevokeInput } from "./model";

/** Every dapp connected to the wallet (injected + WalletConnect), unfiltered — the UI scopes by account. */
function list(): Promise<ConnectedDappView[]> {
	return requestBackground<ConnectedDappView[]>(dappSessionsRpc.methods.list);
}

/** Revoke a connection and get the refreshed list back, so the UI updates without a second read. */
function revoke(input: DappSessionRevokeInput): Promise<ConnectedDappView[]> {
	return requestBackground<ConnectedDappView[]>(dappSessionsRpc.methods.revoke, input);
}

export const dappSessionsClient = {
	list,
	revoke,
};
