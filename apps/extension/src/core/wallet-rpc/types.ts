export type WalletRpcConfirmationRequest = {
	data?: unknown;
	message?: string;
	method?: string;
	requester?: { name?: string; origin: string };
	title: string;
};

export type WalletRpcConfirmationHandler = (
	request: WalletRpcConfirmationRequest,
) => Promise<boolean>;

export type WalletRpcAuthorization = {
	isGranted: (methodId: string) => boolean;
};

export const DENY_ALL_AUTHORIZATION: WalletRpcAuthorization = { isGranted: () => false };

export type WalletRpcBaseContext = {
	authorization: WalletRpcAuthorization;
	confirm?: WalletRpcConfirmationHandler;
	requester?: { name?: string; origin: string };
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
