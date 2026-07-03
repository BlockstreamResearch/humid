import {
	WALLET_RPC_ERROR_REASONS,
	WalletRpcResourceUnavailableError,
	WalletRpcUnauthorizedError,
	WalletRpcUserRejectedError,
} from "@/core/wallet-rpc/errors";
import type { WalletRpcBaseContext } from "@/core/wallet-rpc/types";

import type { WalletMethodCapability } from "./capability";
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
	/**
	 * Permission descriptor for this method: drives the connect-time checkbox and
	 * invoke-time enforcement. Optional so non-dapp/internal methods can opt out.
	 */
	capability?: WalletMethodCapability<TParams, TContext, TResult>;
	confirmation?: ConfirmationPolicy<TParams, TContext, TReview>;
	execute: (input: WalletMethodInput<TParams, TContext, TReview>) => Promise<TResult> | TResult;
	parse: (params: unknown) => TParams;
	review: (input: { context: TContext; params: TParams }) => Promise<TReview> | TReview;
};

/**
 * A wallet RPC method handler with its permission descriptor attached, so a
 * chain-agnostic registry can collect capabilities straight off the method fns.
 */
export type WalletMethod<TParams, TContext extends WalletRpcBaseContext, TResult> = ((
	params: unknown,
	context: TContext,
) => Promise<TResult>) & {
	capability?: WalletMethodCapability<TParams, TContext, TResult>;
};

export function createWalletMethod<
	TParams,
	TContext extends WalletRpcBaseContext,
	TReview,
	TResult,
>({
	capability,
	confirmation,
	execute,
	parse,
	review,
}: CreateWalletMethodInput<TParams, TContext, TReview, TResult>): WalletMethod<
	TParams,
	TContext,
	TResult
> {
	const handler = async (params: unknown, context: TContext): Promise<TResult> => {
		const parsedParams = parse(params);

		// Permission enforcement for dapp calls. An authorization surface means the call is
		// scoped to a session's granted capabilities (internal calls omit it → full access).
		// An ungranted read degrades to its RESTRICTED stub; anything else hard-errors — both
		// before `review`, so we never resolve the account for a call we will not fulfil.
		if (capability && context.authorization && !context.authorization.isGranted(capability.id)) {
			if (capability.restricted) {
				return capability.restricted({ context, params: parsedParams });
			}

			throw new WalletRpcUnauthorizedError(capability.id);
		}

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

	return Object.assign(handler, { capability });
}
