export const CAIP25_METHODS = {
	addChain: "wallet_addChain",
	createSession: "wallet_createSession",
	getSession: "wallet_getSession",
	invokeMethod: "wallet_invokeMethod",
	revokeSession: "wallet_revokeSession",
	switchChain: "wallet_switchChain",
} as const;

/** Per scope, which methods run without a prompt (`true`) and which ask every time (`false`). */
export const HUMID_METHOD_POLICY_PROPERTY = "humid_methodPolicy";

export type Caip25ScopeString = string;

export type Caip25ScopeObject = {
	accounts?: string[];
	methods: string[];
	notifications: string[];
	references?: string[];
};

export type Caip25Scopes = Record<Caip25ScopeString, Caip25ScopeObject>;

export type Caip25ScopedProperties = Record<Caip25ScopeString, Record<string, unknown>>;

export type Caip25CreateSessionParams = {
	optionalScopes?: Caip25Scopes;
	requiredScopes?: Caip25Scopes;
	scopedProperties?: Record<string, unknown>;
	sessionProperties?: Record<string, unknown>;
};

export type Caip25CreateSessionResult = {
	scopedProperties?: Caip25ScopedProperties;
	sessionProperties?: Record<string, unknown>;
	sessionScopes: Caip25Scopes;
};

export type Caip25GetSessionResult = {
	scopedProperties?: Caip25ScopedProperties;
	sessionScopes: Caip25Scopes;
};

export type Caip25RevokeSessionResult = {
	revoked: boolean;
};

export type Caip27InvokeMethodParams = {
	request: {
		method: string;
		params?: unknown;
	};
	scope: Caip25ScopeString;
	sessionId?: string;
};
