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
		const reviewing = Promise.resolve(review({ context, params: parsedParams }));
		const input = async (choice?: unknown) => ({
			choice,
			context,
			params: parsedParams,
			review: await reviewing,
		});

		if (context.authorization.isGranted(id)) return execute(await input());

		if (!context.confirm) {
			await reviewing;

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
				const ready = await input(choice);

				executed = await execute(ready);

				return receipt({ ...ready, result: executed });
			});
		const request = reviewing.then(async (reviewed) => ({
			...(await confirmation({ context, params: parsedParams, review: reviewed })),
			method: id,
			requester: context.requester,
		}));
		const decision = await context.confirm(request, complete);

		if (!decision.approved) {
			throw new WalletRpcUserRejectedError();
		}

		return complete ? (executed as TResult) : execute(await input(decision.result));
	};

	return Object.assign(handler, { id });
}
