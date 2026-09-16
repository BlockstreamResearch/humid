import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { dappSessionsClient } from "@/core/dapp-sessions/client";
import type {
	ConnectedDappView,
	DappSessionRevokeInput,
	DappSessionSetPolicyInput,
} from "@/core/dapp-sessions/model";

export const DAPP_SESSIONS_QUERY_KEY = ["dappSessions"] as const;

export function connectedDappKey(dapp: ConnectedDappView): string {
	return dapp.sessionId ?? dapp.topic ?? dapp.label;
}

export function useConnectedDapps(accountGroupId?: string) {
	const queryClient = useQueryClient();
	const query = useQuery({
		queryFn: () => dappSessionsClient.list(),
		queryKey: DAPP_SESSIONS_QUERY_KEY,
	});

	const revokeMutation = useMutation({
		mutationFn: dappSessionsClient.revoke,
		onSuccess: (next) => {
			queryClient.setQueryData(DAPP_SESSIONS_QUERY_KEY, next);
		},
	});

	const setPolicyMutation = useMutation({
		mutationFn: dappSessionsClient.setPolicy,
		onSuccess: (next) => {
			queryClient.setQueryData(DAPP_SESSIONS_QUERY_KEY, next);
		},
	});

	const all = query.data ?? [];
	const dapps = accountGroupId
		? all.filter((dapp) => dapp.accountGroupIds.includes(accountGroupId))
		: all;

	const revoke = (dapp: ConnectedDappView) => {
		if (dapp.transport === "walletconnect") {
			if (dapp.topic) revokeMutation.mutate({ transport: "walletconnect", topic: dapp.topic });

			return;
		}

		if (dapp.sessionId && accountGroupId) {
			revokeMutation.mutate({ transport: "injected", sessionId: dapp.sessionId, accountGroupId });
		}
	};

	const setMethodSilent = (dapp: ConnectedDappView, method: string, silent: boolean) => {
		if (dapp.transport !== "injected" || !dapp.sessionId) return;

		setPolicyMutation.mutate({ methods: { [method]: silent }, sessionId: dapp.sessionId });
	};

	return {
		dapps,
		isError: query.isError,
		isLoading: query.isPending,
		revoke,
		revokingKey: revokeMutation.isPending ? revokeTargetKey(revokeMutation.variables) : null,
		setMethodSilent,
		settingMethod: setPolicyMutation.isPending
			? setPolicyTargetMethod(setPolicyMutation.variables)
			: null,
	};
}

function revokeTargetKey(variables: DappSessionRevokeInput | undefined): string | null {
	if (!variables) return null;

	return variables.transport === "injected" ? variables.sessionId : variables.topic;
}

function setPolicyTargetMethod(variables: DappSessionSetPolicyInput | undefined): string | null {
	if (!variables) return null;

	return Object.keys(variables.methods)[0] ?? null;
}
