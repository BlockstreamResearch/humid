/**
 * CAIP-25 (session authorization) and CAIP-27 (method invocation) vocabulary.
 * Chain-agnostic; concrete chains map their scopes onto these shapes.
 *
 * A scope string is a CAIP-2 chain id (e.g. "bip122:<genesis>"). A scope object
 * lists the methods/notifications/accounts authorized within that scope.
 */
export type Caip25ScopeString = string;

export type Caip25ScopeObject = {
	accounts?: string[]; // CAIP-10 account ids
	methods: string[];
	notifications: string[];
	references?: string[];
};

export type Caip25Scopes = Record<Caip25ScopeString, Caip25ScopeObject>;

export type Caip25CreateSessionParams = {
	optionalScopes?: Caip25Scopes;
	requiredScopes?: Caip25Scopes;
	scopedProperties?: Record<string, unknown>;
	sessionProperties?: Record<string, unknown>;
};

export type Caip25CreateSessionResult = {
	sessionProperties?: Record<string, unknown>;
	sessionScopes: Caip25Scopes;
};

export type Caip25GetSessionResult = {
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
