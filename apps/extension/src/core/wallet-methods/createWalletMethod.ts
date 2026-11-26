import type { TransactionReceiptData } from "@/common/Confirmation/TransactionReceipt";
import { logger } from "@/core/logger";
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
	spends?: boolean;
};

export type WalletMethod<TContext extends WalletRpcBaseContext, TResult> = ((
	params: unknown,
	context: TContext,
) => Promise<TResult>) & {
	id: string;
};

// A spending request waits for the one before, so it is reviewed against coins that one left.
let spending: Promise<unknown> = Promise.resolve();

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
	spends = false,
}: CreateWalletMethodInput<TParams, TContext, TReview, TResult>): WalletMethod<TContext, TResult> {
	const run = async (params: unknown, context: TContext): Promise<TResult> => {
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

				// The transaction is out by now, so a receipt that fails still reports success.
				try {
					return await receipt({ ...ready, result: executed });
				} catch (error) {
					logger.warn("Could not build the receipt for a completed request", { error });

					return plainReceipt(executed);
				}
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
	const handler = (params: unknown, context: TContext): Promise<TResult> => {
		if (!spends) return run(params, context);

		const turn = spending.then(() => run(params, context));

		spending = turn.catch(() => undefined);

		return turn;
	};

	return Object.assign(handler, { id });
}

/** What the outcome screen can still say once the details are out of reach. */
function plainReceipt(result: unknown): TransactionReceiptData {
	const txid = (result as { txid?: unknown } | undefined)?.txid;

	return {
		assets: {},
		changes: [],
		fee: "Not available",
		network: "the network",
		...(typeof txid === "string" ? { txid } : {}),
	};
}
