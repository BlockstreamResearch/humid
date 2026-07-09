import { useMutation, useQueryClient } from "@tanstack/react-query";

import { accountsClient } from "@/core/accounts/application/accounts-rpc/client";
import type {
	EstimateMaxSendInput,
	EstimateMaxSendResult,
	SendTransferInput,
	SendTransferResult,
	TransferReview,
} from "@/core/accounts/application/accounts-rpc/model/types";

/**
 * Preview a send for the selected account (validate the recipient, resolve the asset, report ELIP-1
 * confidentiality) WITHOUT signing or broadcasting. Drives the review step; a rejection surfaces the
 * backend's error message on the form.
 */
export function useInspectTransfer() {
	return useMutation<TransferReview, Error, SendTransferInput>({
		mutationFn: (input) => accountsClient.inspectTransfer(input),
	});
}

/**
 * Estimate the max sendable amount (+ assumed L-BTC fee) for an asset on the selected account. The
 * backend syncs first; native L-BTC drains to compute the fee, issued assets return the full balance.
 * Drives the Send form's "Max" button; a rejection surfaces the backend's error message on the form.
 */
export function useEstimateMaxSend() {
	return useMutation<EstimateMaxSendResult, Error, EstimateMaxSendInput>({
		mutationFn: (input) => accountsClient.estimateMaxSend(input),
	});
}

/**
 * Execute a send (build, sign, broadcast) for the selected account. On success the spent UTXOs make
 * the cached portfolio stale, so invalidate it to trigger a fresh balance sync. The popup's own
 * review screen is the confirmation — there is no dapp confirmation round-trip.
 */
export function useSendTransfer() {
	const queryClient = useQueryClient();

	return useMutation<SendTransferResult, Error, SendTransferInput>({
		mutationFn: (input) => accountsClient.sendTransfer(input),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: ["portfolio"] });
		},
	});
}
