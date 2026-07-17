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
} from "@/core/dapp-sessions/model";
import type { WalletConnectSessionSummary } from "@/core/walletconnect/types";

import type { RequestHandlerMap } from "../transport";
import { emitWalletEvent } from "../wallet-events";
import { dappAuthorizationErrors } from "./errors";

export type DappSessionsHandlersDependencies = {
	getAccountModel: () => AccountModelState | null;
	registry: AccountRegistry;
	/** Persist an account-model mutation (wraps the unlocked key-manager update). */
	updateAccountModel: (
		update: (accountModel: AccountModelState) => AccountModelState,
	) => Promise<AccountModelState>;
	/** Active WalletConnect sessions (summaries from the WalletKit client). */
	listWalletConnectSessions: () => WalletConnectSessionSummary[];
	/**
	 * Map a WalletConnect session's CAIP-10 accounts back to the account groups that own them, so a WC
	 * dapp lists under the same accounts as an injected one. Chain-specific (injected from background).
	 */
	resolveWalletConnectAccountGroupIds: (session: WalletConnectSessionSummary) => string[];
	/** End a WalletConnect session entirely (v1: no per-account WalletConnect removal). */
	disconnectWalletConnect: (topic: string) => Promise<void>;
};

/**
 * Popup-facing handlers to view + revoke connected dapps. The injected sessions come from the account
 * model (per-account grants); the WalletConnect sessions come from the WalletKit client and are
 * attributed to accounts via {@link DappSessionsHandlersDependencies.resolveWalletConnectAccountGroupIds}.
 * Never reachable from a dapp — the transport routes injected senders to a separate registry.
 */
export function createDappSessionsInternalHandlers(
	deps: DappSessionsHandlersDependencies,
): RequestHandlerMap {
	return {
		[dappSessionsRpc.methods.list]: () => buildConnectedDappViews(deps),
		[dappSessionsRpc.methods.revoke]: async (message) => {
			await applyRevoke(deps, parseRevokeInput(message.data));

			return buildConnectedDappViews(deps);
		},
	};
}

/** The unified connected-dapp list (injected + WalletConnect), unfiltered — the UI scopes by account. */
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
		// WalletKit notifies the peer (session_delete) on its own point-to-point transport — no
		// broadcast needed. v1 disconnects the whole session (no per-account WalletConnect removal).
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

	// The dapp's authorized account set shrank; if it lost the session entirely, signal that too. Both
	// are global injected broadcasts — each dapp re-queries its own origin-scoped session to derive its
	// new view (or its disconnect). Mirrors createDappAuthorization.revokeSession.
	emitWalletEvent("accountsChanged");
	if (outcome.sessionRemoved) emitWalletEvent("wallet_sessionChanged");
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
