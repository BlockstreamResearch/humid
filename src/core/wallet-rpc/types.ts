export type WalletRpcConfirmationRequest = {
	data?: unknown;
	message?: string;
	title: string;
};

export type WalletRpcConfirmationHandler = (
	request: WalletRpcConfirmationRequest,
) => Promise<boolean>;

export type WalletRpcAuthorization = {
	/** Whether the session granted the capability with this id (the RPC method name). */
	isGranted: (capabilityId: string) => boolean;
};

export type WalletRpcBaseContext = {
	/**
	 * Permission surface for a dapp call: present when the call is scoped to a session's
	 * granted capabilities. Absent for internal/trusted calls, which get full access.
	 */
	authorization?: WalletRpcAuthorization;
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
