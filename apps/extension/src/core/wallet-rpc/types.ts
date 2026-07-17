export type WalletRpcConfirmationRequest = {
	data?: unknown;
	message?: string;
	title: string;
};

export type WalletRpcConfirmationHandler = (
	request: WalletRpcConfirmationRequest,
) => Promise<boolean>;

export type WalletRpcAuthorization = {
	/** Whether a standing permission lets this method run without a per-call confirmation. */
	isGranted: (methodId: string) => boolean;
};

/**
 * No standing permissions — every method confirms. The default for any caller we cannot
 * attribute.
 */
export const DENY_ALL_AUTHORIZATION: WalletRpcAuthorization = { isGranted: () => false };

export type WalletRpcBaseContext = {
	/**
	 * Which methods this caller may run without asking the user. Every caller declares one:
	 * attribute it to a session's permissions, or pass {@link DENY_ALL_AUTHORIZATION}.
	 */
	authorization: WalletRpcAuthorization;
	confirm?: WalletRpcConfirmationHandler;
};

export type WalletRpcRequest = {
	method: string;
	params?: unknown;
};

export type WalletRpcMethodHandler<Context> = (
	params: unknown,
	context: Context,
) => Promise<unknown> | unknown;

export type WalletRpcMethodMap<Context> = Record<string, WalletRpcMethodHandler<Context>>;

export type WalletRpcDispatcher<Context> = {
	dispatch: (request: WalletRpcRequest, context: Context) => Promise<unknown>;
	methods: string[];
};
