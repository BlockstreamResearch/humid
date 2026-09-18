export const dappSessionsRpc = {
	methods: {
		list: "dappSessions.list",
		revoke: "dappSessions.revoke",
		setPolicy: "dappSessions.setPolicy",
	},
} as const;

export type ConnectedDappTransport = "injected" | "walletconnect";

export type ConnectedDappView = {
	transport: ConnectedDappTransport;
	sessionId?: string;
	topic?: string;
	label: string;
	url?: string;
	iconUrl?: string;
	accountGroupIds: string[];
	chains: string[];
	methods: string[];
	methodPolicy: Record<string, boolean>;
	events: string[];
	connectedAt?: number;
};

export type DappSessionRevokeInput =
	| { transport: "injected"; sessionId: string; accountGroupId: string }
	| { transport: "walletconnect"; topic: string };

export type DappSessionSetPolicyInput = {
	sessionId: string;
	methods: Record<string, boolean>;
};
