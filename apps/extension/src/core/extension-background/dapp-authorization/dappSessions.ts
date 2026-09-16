import type { AccountRegistry } from "@/core/accounts/application/account-registry/AccountRegistry";
import type { AccountModelState } from "@/core/accounts/application/account-registry/model/account-model";
import type { DappSessionRecord } from "@/core/accounts/application/account-registry/model/dapp-session";
import type {
	AccountGroupId,
	DappSessionId,
} from "@/core/accounts/application/account-registry/model/identifiers";
import {
	dappSessionsRpc,
	type ConnectedDappView,
	type DappSessionRevokeInput,
	type DappSessionSetPolicyInput,
} from "@/core/dapp-sessions/model";
import type { WalletConnectSessionSummary } from "@/core/walletconnect/types";

import type { RequestHandlerMap } from "../transport";
import { emitWalletEvent } from "../wallet-events";
import { dappAuthorizationErrors } from "./errors";

export type DappSessionsHandlersDependencies = {
	getAccountModel: () => AccountModelState | null;
	registry: AccountRegistry;
	updateAccountModel: (
		update: (accountModel: AccountModelState) => AccountModelState,
	) => Promise<AccountModelState>;
	listWalletConnectSessions: () => WalletConnectSessionSummary[];
	resolveWalletConnectAccountGroupIds: (session: WalletConnectSessionSummary) => string[];
	disconnectWalletConnect: (topic: string) => Promise<void>;
};

export function createDappSessionsInternalHandlers(
	deps: DappSessionsHandlersDependencies,
): RequestHandlerMap {
	return {
		[dappSessionsRpc.methods.list]: () => buildConnectedDappViews(deps),
		[dappSessionsRpc.methods.revoke]: async (message) => {
			await applyRevoke(deps, parseRevokeInput(message.data));

			return buildConnectedDappViews(deps);
		},
		[dappSessionsRpc.methods.setPolicy]: async (message) => {
			await applySetPolicy(deps, parseSetPolicyInput(message.data));

			return buildConnectedDappViews(deps);
		},
	};
}

function buildConnectedDappViews(deps: DappSessionsHandlersDependencies): ConnectedDappView[] {
	const accountModel = deps.getAccountModel();

	if (!accountModel) {
		throw dappAuthorizationErrors.walletLocked("Unlock the wallet to view connected dapps.");
	}

	const injected = Object.values(accountModel.dappSessions)
		.filter((session) => session.transport === "injected")
		.map(toInjectedView);

	const walletConnect = deps
		.listWalletConnectSessions()
		.map((session) =>
			toWalletConnectView(session, deps.resolveWalletConnectAccountGroupIds(session)),
		);

	return [...injected, ...walletConnect];
}

async function applyRevoke(
	deps: DappSessionsHandlersDependencies,
	input: DappSessionRevokeInput,
): Promise<void> {
	if (input.transport === "walletconnect") {
		await deps.disconnectWalletConnect(input.topic);

		return;
	}

	let outcome = { revoked: false, sessionRemoved: false };

	await deps.updateAccountModel((model) => {
		const result = deps.registry.revokeAccountFromDappSession({
			accountGroupId: input.accountGroupId as AccountGroupId,
			accountModel: model,
			sessionId: input.sessionId as DappSessionId,
		});

		outcome = { revoked: result.revoked, sessionRemoved: result.sessionRemoved };

		return result.accountModel;
	});

	if (!outcome.revoked) return;

	// are global injected broadcasts — each dapp re-queries its own origin-scoped session to derive its
	emitWalletEvent("accountsChanged");
	if (outcome.sessionRemoved) emitWalletEvent("wallet_sessionChanged");
}

async function applySetPolicy(
	deps: DappSessionsHandlersDependencies,
	input: DappSessionSetPolicyInput,
): Promise<void> {
	let updated = false;

	await deps.updateAccountModel((model) => {
		const result = deps.registry.setDappSessionMethodPolicy({
			accountModel: model,
			methods: input.methods,
			sessionId: input.sessionId as DappSessionId,
		});

		updated = result.updated;

		return result.accountModel;
	});

	// session (wallet_getSession) and picks up the new silent-vs-prompt set. Injected global broadcast.
	if (updated) emitWalletEvent("wallet_sessionChanged");
}

function toInjectedView(session: DappSessionRecord): ConnectedDappView {
	return {
		transport: "injected",
		sessionId: session.id,
		label: hostOf(session.origin) ?? session.origin ?? "Unknown dapp",
		url: session.origin,
		accountGroupIds: [...session.scope.accountGroupIds],
		chains: [...session.scope.chains],
		methods: Object.keys(session.scope.methods),
		methodPolicy: { ...session.scope.methods },
		events: [...session.scope.events],
		connectedAt: session.createdAt,
	};
}

function toWalletConnectView(
	session: WalletConnectSessionSummary,
	accountGroupIds: string[],
): ConnectedDappView {
	const chains = new Set<string>();
	const methods = new Set<string>();
	const events = new Set<string>();

	for (const scope of Object.values(session.namespaces)) {
		for (const account of scope.accounts) chains.add(account.split(":").slice(0, 2).join(":"));
		for (const chain of scope.chains ?? []) chains.add(chain);
		for (const method of scope.methods) methods.add(method);
		for (const event of scope.events) events.add(event);
	}

	return {
		transport: "walletconnect",
		topic: session.topic,
		label: session.peer.name || hostOf(session.peer.url) || "WalletConnect dapp",
		url: session.peer.url,
		iconUrl: session.peer.icons?.[0],
		accountGroupIds,
		chains: [...chains],
		methods: [...methods],
		methodPolicy: {},
		events: [...events],
	};
}

function parseRevokeInput(data: unknown): DappSessionRevokeInput {
	if (!isRecord(data)) {
		throw dappAuthorizationErrors.invalidParams("dappSessions.revoke params must be an object.");
	}

	if (data.transport === "walletconnect") {
		if (typeof data.topic !== "string") {
			throw dappAuthorizationErrors.invalidParams("A WalletConnect revoke requires a topic.");
		}

		return { transport: "walletconnect", topic: data.topic };
	}

	if (data.transport === "injected") {
		if (typeof data.sessionId !== "string" || typeof data.accountGroupId !== "string") {
			throw dappAuthorizationErrors.invalidParams(
				"An injected revoke requires a sessionId and an accountGroupId.",
			);
		}

		return {
			transport: "injected",
			sessionId: data.sessionId,
			accountGroupId: data.accountGroupId,
		};
	}

	throw dappAuthorizationErrors.invalidParams("dappSessions.revoke has an unknown transport.");
}

function parseSetPolicyInput(data: unknown): DappSessionSetPolicyInput {
	if (!isRecord(data) || typeof data.sessionId !== "string" || !isRecord(data.methods)) {
		throw dappAuthorizationErrors.invalidParams(
			"dappSessions.setPolicy requires a sessionId and a methods map.",
		);
	}

	const methods: Record<string, boolean> = {};

	for (const [method, silent] of Object.entries(data.methods)) {
		if (typeof silent !== "boolean") {
			throw dappAuthorizationErrors.invalidParams("Each method policy value must be a boolean.");
		}

		methods[method] = silent;
	}

	return { sessionId: data.sessionId, methods };
}

function hostOf(url: string | undefined): string | undefined {
	if (!url) return undefined;

	try {
		return new URL(url).host;
	} catch {
		return undefined;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
