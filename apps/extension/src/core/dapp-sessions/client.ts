import { requestBackground } from "@/core/extension-rpc";

import {
	dappSessionsRpc,
	type ConnectedDappView,
	type DappSessionRevokeInput,
	type DappSessionSetPolicyInput,
} from "./model";

function list(): Promise<ConnectedDappView[]> {
	return requestBackground<ConnectedDappView[]>(dappSessionsRpc.methods.list);
}

function revoke(input: DappSessionRevokeInput): Promise<ConnectedDappView[]> {
	return requestBackground<ConnectedDappView[]>(dappSessionsRpc.methods.revoke, input);
}

function setPolicy(input: DappSessionSetPolicyInput): Promise<ConnectedDappView[]> {
	return requestBackground<ConnectedDappView[]>(dappSessionsRpc.methods.setPolicy, input);
}

export const dappSessionsClient = {
	list,
	revoke,
	setPolicy,
};
