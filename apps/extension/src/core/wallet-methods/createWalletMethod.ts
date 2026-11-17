import type { TransactionReceiptData } from "@/common/Confirmation/TransactionReceipt";
import {
	WALLET_RPC_ERROR_REASONS,
	WalletRpcResourceUnavailableError,
	WalletRpcUserRejectedError,
} from "@/core/wallet-rpc/errors";
import type { WalletRpcBaseContext } from "@/core/wallet-rpc/types";

import type { ConfirmationPolicy } from "./ConfirmationPolicy";

export type WalletMethodInput<TParams, TContext, TReview> = {
	choice?: unknown;
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
	confirmation: ConfirmationPolicy<TParams, TContext, TReview>;
	execute: (input: WalletMethodInput<TParams, TContext, TReview>) => Promise<TResult> | TResult;
	id: string;
	parse: (params: unknown) => TParams;
	receipt?: (
		input: WalletMethodInput<TParams, TContext, TReview> & { result: TResult },
	) => Promise<TransactionReceiptData> | TransactionReceiptData;
	review: (input: { context: TContext; params: TParams }) => Promise<TReview> | TReview;
};

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
	receipt,
	review,
}: CreateWalletMethodInput<TParams, TContext, TReview, TResult>): WalletMethod<TContext, TResult> {
	const handler = async (params: unknown, context: TContext): Promise<TResult> => {
		const parsedParams = parse(params);
		const reviewed = await review({ context, params: parsedParams });
		const run = (choice?: unknown) =>
			execute({ choice, context, params: parsedParams, review: reviewed });

		if (context.authorization.isGranted(id)) return run();

		if (!context.confirm) {
			throw new WalletRpcResourceUnavailableError(
				"Wallet method requires a confirmation surface.",
				undefined,
				WALLET_RPC_ERROR_REASONS.CONFIRMATION_UNAVAILABLE,
			);
		}

		let executed: TResult | undefined;
		const complete =
			receipt &&
			(async (choice: unknown) => {
				executed = await run(choice);

				return receipt({
					choice,
					context,
					params: parsedParams,
					result: executed,
					review: reviewed,
				});
			});
		const decision = await context.confirm(
			{
				...(await confirmation({ context, params: parsedParams, review: reviewed })),
				method: id,
				requester: context.requester,
			},
			complete,
		);

		if (!decision.approved) {
			throw new WalletRpcUserRejectedError();
		}

		return complete ? (executed as TResult) : run(decision.result);
	};

	return Object.assign(handler, { id });
}
