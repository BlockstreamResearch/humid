import { useMutation, useQueryClient } from "@tanstack/react-query";

import { accountsClient } from "@/core/accounts/application/accounts-rpc/client";
import type {
	EstimateMaxSendInput,
	EstimateMaxSendResult,
	SendTransferInput,
	SendTransferResult,
	TransferReview,
} from "@/core/accounts/application/accounts-rpc/model/types";

export function useInspectTransfer() {
	return useMutation<TransferReview, Error, SendTransferInput>({
		mutationFn: (input) => accountsClient.inspectTransfer(input),
	});
}

export function useEstimateMaxSend() {
	return useMutation<EstimateMaxSendResult, Error, EstimateMaxSendInput>({
		mutationFn: (input) => accountsClient.estimateMaxSend(input),
	});
}

export function useSendTransfer() {
	const queryClient = useQueryClient();

	return useMutation<SendTransferResult, Error, SendTransferInput>({
		mutationFn: (input) => accountsClient.sendTransfer(input),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: ["portfolio"] });
		},
	});
}
