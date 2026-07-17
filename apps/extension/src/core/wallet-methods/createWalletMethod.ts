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
	/** What the user is shown when this method runs without a standing permission. */
	confirmation: ConfirmationPolicy<TParams, TContext, TReview>;
	execute: (input: WalletMethodInput<TParams, TContext, TReview>) => Promise<TResult> | TResult;
	/** RPC method name. Doubles as the permission id and the registry's dispatch key. */
	id: string;
	parse: (params: unknown) => TParams;
	review: (input: { context: TContext; params: TParams }) => Promise<TReview> | TReview;
};

/**
 * A wallet RPC method handler with its id attached, so a chain-agnostic registry can key
 * dispatch straight off the method fns.
 */
export type WalletMethod<TContext extends WalletRpcBaseContext, TResult> = ((
	params: unknown,
	context: TContext,
) => Promise<TResult>) & {
	id: string;
};

export function createWalletMethod<
	TParams,
	TContext extends WalletRpcBaseContext,
	TReview,
	TResult,
>({
	confirmation,
	execute,
	id,
	parse,
	review,
}: CreateWalletMethodInput<TParams, TContext, TReview, TResult>): WalletMethod<TContext, TResult> {
	const handler = async (params: unknown, context: TContext): Promise<TResult> => {
		const parsedParams = parse(params);

		const reviewed = await review({ context, params: parsedParams });

		// One homogeneous permission gate: a standing permission means "run without asking",
		// its absence means the user confirms this call. Nothing is denied outright.
		if (!context.authorization.isGranted(id)) {
			if (!context.confirm) {
				throw new WalletRpcResourceUnavailableError(
					"Wallet method requires a confirmation surface.",
					undefined,
					WALLET_RPC_ERROR_REASONS.CONFIRMATION_UNAVAILABLE,
				);
			}

			const confirmed = await context.confirm(
				await confirmation({ context, params: parsedParams, review: reviewed }),
			);

			if (!confirmed) {
				throw new WalletRpcUserRejectedError();
			}
		}

		return execute({ context, params: parsedParams, review: reviewed });
	};

	return Object.assign(handler, { id });
}
