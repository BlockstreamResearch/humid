import {
	WALLET_RPC_ERROR_REASONS,
	WalletRpcResourceUnavailableError,
	WalletRpcUserRejectedError,
} from "@/core/wallet-rpc/errors";
import type { WalletRpcBaseContext } from "@/core/wallet-rpc/types";

import type { ConfirmationPolicy } from "./ConfirmationPolicy";

export type WalletMethodInput<TParams, TContext, TReview> = {
	context: TContext;
	params: TParams;
	review: TReview;
};

export type CreateWalletMethodInput<
	TParams,
	TContext extends WalletRpcBaseContext,
	TReview,
	TResult,
> = {
	confirmation?: ConfirmationPolicy<TParams, TContext, TReview>;
	execute: (input: WalletMethodInput<TParams, TContext, TReview>) => Promise<TResult> | TResult;
	parse: (params: unknown) => TParams;
	review: (input: { context: TContext; params: TParams }) => Promise<TReview> | TReview;
};

export function createWalletMethod<
	TParams,
	TContext extends WalletRpcBaseContext,
	TReview,
	TResult,
>({
	confirmation,
	execute,
	parse,
	review,
}: CreateWalletMethodInput<TParams, TContext, TReview, TResult>) {
	return async (params: unknown, context: TContext): Promise<TResult> => {
		const parsedParams = parse(params);
		const reviewed = await review({
			context,
			params: parsedParams,
		});

		if (confirmation) {
			const request = await confirmation({
				context,
				params: parsedParams,
				review: reviewed,
			});

			if (request) {
				if (!context.confirm) {
					throw new WalletRpcResourceUnavailableError(
						"Wallet method requires a confirmation surface.",
						undefined,
						WALLET_RPC_ERROR_REASONS.CONFIRMATION_UNAVAILABLE,
					);
				}

				const confirmed = await context.confirm(request);

				if (!confirmed) {
					throw new WalletRpcUserRejectedError();
				}
			}
		}

		return execute({
			context,
			params: parsedParams,
			review: reviewed,
		});
	};
}
