import type { WalletRpcConfirmationRequest } from "@/core/wallet-rpc/types";

export type ConfirmationPolicyInput<TParams, TContext, TReview> = {
	context: TContext;
	params: TParams;
	review: TReview;
};

export type ConfirmationPolicy<TParams, TContext, TReview> = (
	input: ConfirmationPolicyInput<TParams, TContext, TReview>,
) => Promise<WalletRpcConfirmationRequest | null> | WalletRpcConfirmationRequest | null;
