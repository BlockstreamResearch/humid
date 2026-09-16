export type Caip25ScopeString = string;

export type Caip25ScopeObject = {
	accounts?: string[]; // CAIP-10 account ids
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
