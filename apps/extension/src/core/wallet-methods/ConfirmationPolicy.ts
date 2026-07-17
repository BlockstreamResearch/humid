import type { WalletRpcConfirmationRequest } from "@/core/wallet-rpc/types";

export type ConfirmationPolicyInput<TParams, TContext, TReview> = {
	context: TContext;
	params: TParams;
	review: TReview;
};

/** Builds what the user is shown when a method runs without a standing permission. */
export type ConfirmationPolicy<TParams, TContext, TReview> = (
	input: ConfirmationPolicyInput<TParams, TContext, TReview>,
) => Promise<WalletRpcConfirmationRequest> | WalletRpcConfirmationRequest;
