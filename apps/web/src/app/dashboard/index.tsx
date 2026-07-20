import {
	createSession,
	getSession,
	invokeMethod,
	LIQUID_DESCRIPTOR_CHANGED_EVENT,
	LIQUID_MAINNET_CHAIN_ID,
	LIQUID_NAMESPACE,
	LIQUID_TESTNET_CHAIN_ID,
	liquidNetworks,
	liquidWalletRpcMethods,
	readMethodPolicy,
	revokeSession,
	type Caip25GetSessionResult,
	type Caip25Scopes,
	type CaipRpcProvider,
	type MethodPolicy,
} from "@humid/appkit-injected-adapter";
import { useAppKit, useAppKitAccount, useDisconnect } from "@reown/appkit/react";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

const LIQUID_MAINNET_LBTC_ASSET_ID = `${LIQUID_MAINNET_CHAIN_ID}/elip144:6f0279e9ed041c3d710a9f57d0c02928416460c4b722ae3457a11eec381c526d`;
const LIQUID_TESTNET_LBTC_ASSET_ID = `${LIQUID_TESTNET_CHAIN_ID}/elip144:144c654344aa716d6f3abcc1ca90e5641e4e2a7f633bc09fe3baf64585819a49`;
const DEFAULT_IDENTITY = "ssh://humid@localhost";
const DEFAULT_IDENTITY_CHALLENGE =
	"4c69717569642057616c6c6574205250432050726f66696c65206964656e74697479206368616c6c656e6765";
const DEFAULT_KDF_INFO = "68756d69642d7765622d74657374";

type Invoke = (method: string, params?: unknown) => Promise<unknown>;

export default function Dashboard() {
	return (
		<div className="mx-auto flex min-h-svh w-full max-w-4xl flex-col gap-6 p-4 md:p-6">
			<DebugDashboard />
		</div>
	);
}

/** The injected provider appears a tick after load; retry briefly so the UI recovers on its own. */
function useHumidProvider(): CaipRpcProvider | null {
	const [provider, setProvider] = useState<CaipRpcProvider | null>(
		() => (window.humid as CaipRpcProvider | undefined) ?? null,
	);

	useEffect(() => {
		if (provider) return;

		let tries = 0;
		const interval = setInterval(() => {
			tries += 1;
			const found = window.humid as CaipRpcProvider | undefined;
			if (found) {
				setProvider(found);
				clearInterval(interval);
			} else if (tries > 12) {
				clearInterval(interval);
			}
		}, 300);

		return () => clearInterval(interval);
	}, [provider]);

	return provider;
}

type WalletEventLogEntry = {
	at: string;
	id: number;
	name: string;
	payload: unknown;
	// For account/session events, the accounts resolved by re-reading wallet_getSession. The broadcast
	// payload is only a trigger — CAIP-25 accounts are per-origin, so the dapp reads its own session
	// scope rather than receiving them in a shared broadcast.
	resolvedAccounts?: string[];
};

// Every wallet provider event the extension can broadcast to window.humid (hybrid EIP-1193 + CAIP).
const WALLET_EVENT_NAMES = [
	"accountsChanged",
	"chainChanged",
	"connect",
	"disconnect",
	"wallet_sessionChanged",
	LIQUID_DESCRIPTOR_CHANGED_EVENT,
];

// Events that change the account set. For these the dashboard re-reads wallet_getSession and shows
// the resolved accounts in the log — the broadcast payload itself is only a trigger.
const ACCOUNT_RELEVANT_EVENTS = new Set([
	"accountsChanged",
	"connect",
	"wallet_sessionChanged",
	LIQUID_DESCRIPTOR_CHANGED_EVENT,
]);

/**
 * Subscribe to every wallet provider event on window.humid and keep a bounded, newest-first log so
 * the dashboard can show that events actually fire. `onEvent` (held in a ref so new closures don't
 * re-subscribe) runs on each event, letting dependent reads — the session — refresh reactively
 * instead of only by poll.
 */
function useWalletEvents(
	provider: CaipRpcProvider | null,
	onEvent: () => void,
): { clear: () => void; log: WalletEventLogEntry[] } {
	const [log, setLog] = useState<WalletEventLogEntry[]>([]);
	const onEventRef = useRef(onEvent);
	const counterRef = useRef(0);

	// Keep the latest callback without re-subscribing: a fresh closure each render updates the ref only.
	useEffect(() => {
		onEventRef.current = onEvent;
	});

	useEffect(() => {
		const humid = window.humid;
		if (!provider || !humid?.on) return;

		const on = humid.on;
		const unsubscribers = WALLET_EVENT_NAMES.map((name) =>
			on({
				event: name,
				listener: (payload) => {
					counterRef.current += 1;
					const entryId = counterRef.current;
					const entry: WalletEventLogEntry = {
						at: new Date().toLocaleTimeString(),
						id: entryId,
						name,
						payload,
					};
					setLog((prev) => [entry, ...prev].slice(0, 50));
					onEventRef.current();

					// The account/session events are triggers; resolve this dapp's accounts via getSession and
					// attach them to the entry, so the log shows what the event actually leads to.
					if (ACCOUNT_RELEVANT_EVENTS.has(name) && provider) {
						getSession(provider)
							.then((result) => {
								const accounts = [
									...new Set(
										Object.values(result.sessionScopes).flatMap((scope) => scope.accounts ?? []),
									),
								];
								setLog((prev) =>
									prev.map((item) =>
										item.id === entryId ? { ...item, resolvedAccounts: accounts } : item,
									),
								);
							})
							.catch(() => undefined);
					}
				},
			}),
		);

		return () => unsubscribers.forEach((unsubscribe) => unsubscribe?.());
	}, [provider]);

	const clear = useCallback(() => setLog([]), []);

	return { clear, log };
}

function DebugDashboard() {
	const provider = useHumidProvider();
	const { open } = useAppKit();
	const { disconnect } = useDisconnect();

	const [chainId, setChainId] = useState<string>(LIQUID_TESTNET_CHAIN_ID);
	const [sessionResult, setSessionResult] = useState<Caip25GetSessionResult | null>(null);
	const [knownAddress, setKnownAddress] = useState("");

	// The authorized scopes, split out from the full result for the many places that only need them.
	const session = sessionResult?.sessionScopes ?? null;

	const loadSession = () => {
		if (!provider) return;
		getSession(provider)
			.then(setSessionResult)
			.catch(() => setSessionResult(null));
	};

	// Poll the session so the permission badges / status stay live after connect or disconnect
	// without a manual refresh (wallet_getSession is a read-only call — no wallet prompt).
	useEffect(() => {
		if (!provider) return;

		let cancelled = false;

		const load = () => {
			getSession(provider)
				.then((result) => {
					if (!cancelled) setSessionResult(result);
				})
				.catch(() => {
					if (!cancelled) setSessionResult(null);
				});
		};

		load();
		const interval = setInterval(load, 4000);

		return () => {
			cancelled = true;
			clearInterval(interval);
		};
	}, [provider]);

	// Reactivity: a wallet-side change (account / chain switch, lock/unlock, revoke) pushes an event;
	// re-read the session immediately instead of waiting for the poll. The log itself is rendered below.
	const { clear: clearEvents, log: eventLog } = useWalletEvents(provider, loadSession);

	if (!provider) {
		return (
			<Card className="max-w-3xl">
				<CardHeader>
					<CardTitle>HUMID extension not detected</CardTitle>
					<CardDescription>
						window.humid is not present on this page. Load the HUMID extension, then reload this
						tab.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Button onClick={() => window.location.reload()}>Reload</Button>
				</CardContent>
			</Card>
		);
	}

	const invoke: Invoke = (method, params) => invokeMethod(provider, chainId, method, params);

	// The full authorized surface for the active chain, plus the wallet's silent-vs-prompt policy.
	// A method is unsupported when absent from the surface; otherwise silent (policy true) or
	// needs-approval (policy false / unset — the wallet confirms it on every call).
	const supportedMethods = new Set(session?.[chainId]?.methods ?? []);
	const methodPolicy = sessionResult ? readMethodPolicy(sessionResult, chainId) : {};
	const policyFor = (method: string): MethodState =>
		methodState(method, supportedMethods, methodPolicy);
	const hasSession = Boolean(session && Object.keys(session).length);

	return (
		<div className="flex max-w-4xl flex-col gap-6">
			<ConnectionCard
				chainId={chainId}
				onChainChange={setChainId}
				onConnectAppKit={() => open({ view: "Connect", namespace: LIQUID_NAMESPACE })}
				onCreateSession={() => createSession(provider, buildAllScopes()).then(loadSession)}
				onDisconnect={async () => {
					await revokeSession(provider).catch(() => undefined);
					await disconnect({ namespace: LIQUID_NAMESPACE }).catch(() => undefined);
					loadSession();
				}}
				session={session}
			/>

			<SessionCard
				chainId={chainId}
				onRefresh={loadSession}
				policyFor={policyFor}
				sessionResult={sessionResult}
			/>

			<AutoLoadCard
				chainId={chainId}
				hasSession={hasSession}
				invoke={invoke}
				policyFor={policyFor}
			/>

			<EventLogCard log={eventLog} onClear={clearEvents} />

			<GetBalanceCard chainId={chainId} invoke={invoke} policy={policyFor("getBalance")} />
			<GetUtxosCard
				chainId={chainId}
				invoke={invoke}
				onAddress={setKnownAddress}
				policy={policyFor("getUTXOs")}
			/>
			<GetWalletDescriptorCard invoke={invoke} policy={policyFor("getWalletDescriptor")} />
			<SendTransferCard chainId={chainId} invoke={invoke} policy={policyFor("sendTransfer")} />
			<SignMessageCard
				invoke={invoke}
				knownAddress={knownAddress}
				policy={policyFor("signMessage")}
			/>
			<SignPsetCard invoke={invoke} policy={policyFor("signPset")} />
			<GetIdentityPublicKeyCard invoke={invoke} policy={policyFor("getIdentityPublicKey")} />
			<GetIdentitySharedKeyCard invoke={invoke} policy={policyFor("getIdentitySharedKey")} />
			<SignIdentityCard invoke={invoke} policy={policyFor("signIdentity")} />
			<ProcessCtCard invoke={invoke} policy={policyFor("processConfidentialTransaction")} />
		</div>
	);
}

/* ---------- method policy (silent vs prompt vs unsupported) ---------- */

type MethodState = "silent" | "needs-approval" | "unsupported";

/**
 * Fold the session surface and `humid_methodPolicy` into one of three states a card can render.
 * Supported-but-not-silent means the wallet prompts on every call; declining yields a 4001 error.
 */
function methodState(method: string, supported: Set<string>, policy: MethodPolicy): MethodState {
	if (!supported.has(method)) return "unsupported";
	return policy[method] === true ? "silent" : "needs-approval";
}

const METHOD_STATE_META: Record<MethodState, { className: string; label: string }> = {
	silent: {
		className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
		label: "silent",
	},
	"needs-approval": {
		className: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
		label: "needs approval",
	},
	unsupported: {
		className: "text-muted-foreground",
		label: "unsupported",
	},
};

function PolicyBadge({ state }: { state: MethodState }) {
	const meta = METHOD_STATE_META[state];
	return (
		<Badge variant="outline" className={meta.className}>
			{meta.label}
		</Badge>
	);
}

function PolicyLegend() {
	return (
		<div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
			<span className="flex items-center gap-1.5">
				<PolicyBadge state="silent" /> runs without a prompt
			</span>
			<span className="flex items-center gap-1.5">
				<PolicyBadge state="needs-approval" /> prompts on every call
			</span>
			<span className="flex items-center gap-1.5">
				<PolicyBadge state="unsupported" /> not in this session
			</span>
		</div>
	);
}

function EventLogCard({ log, onClear }: { log: WalletEventLogEntry[]; onClear: () => void }) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Wallet events</CardTitle>
				<CardDescription>
					Live feed from window.humid.on. Switch the selected account or chain in the wallet, or
					lock it, and the matching event should appear here — this is where you can see the event
					system working.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-3">
				<div className="flex items-center justify-between">
					<Badge variant="secondary">{log.length} received</Badge>
					<Button size="sm" variant="outline" onClick={onClear} disabled={log.length === 0}>
						Clear
					</Button>
				</div>
				{log.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						No events yet. Change the selected account or chain in the wallet, or lock it, to see
						events arrive.
					</p>
				) : (
					<ul className="flex max-h-80 flex-col gap-1 overflow-auto">
						{log.map((entry) => (
							<li key={entry.id} className="rounded-md border p-2 font-mono text-xs">
								<div className="flex items-center gap-2">
									<span className="text-muted-foreground">{entry.at}</span>
									<Badge>{entry.name}</Badge>
								</div>
								<pre className="mt-1 break-all whitespace-pre-wrap">
									{JSON.stringify(entry.payload)}
								</pre>
								{entry.resolvedAccounts ? (
									<div className="text-muted-foreground mt-1 break-all">
										→ getSession accounts ({entry.resolvedAccounts.length}):{" "}
										{entry.resolvedAccounts.join(", ") || "(none)"}
									</div>
								) : null}
							</li>
						))}
					</ul>
				)}
			</CardContent>
		</Card>
	);
}

function ConnectionCard({
	chainId,
	onChainChange,
	onConnectAppKit,
	onCreateSession,
	onDisconnect,
	session,
}: {
	chainId: string;
	onChainChange: (id: string) => void;
	onConnectAppKit: () => void;
	onCreateSession: () => Promise<void>;
	onDisconnect: () => Promise<void>;
	session: Caip25Scopes | null;
}) {
	const { call, pending, result } = useRpcCall();
	const hasSession = Boolean(session && Object.keys(session).length);

	// AppKit's reactive account for our custom bip122 namespace. The injected adapter bridges
	// window.humid events into AppKit, so isConnected / address update on wallet-side connect,
	// account switch, revoke, or lock — no polling here (the wallet_getSession poll drives the
	// permission badges only).
	const { address, isConnected } = useAppKitAccount({ namespace: LIQUID_NAMESPACE });

	return (
		<Card>
			<CardHeader>
				<CardTitle>HUMID Liquid Wallet RPC — debug dashboard</CardTitle>
				<CardDescription>
					Injected window.humid, CAIP-25/27. Every authorized method is callable — the wallet runs
					it silently or prompts for confirmation per humid_methodPolicy (decline yields JSON-RPC
					4001). Each method has its own card below that prints the raw result or error.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<div className="flex flex-wrap items-center gap-3 text-sm">
					<StatusRow
						label="Connection"
						value={isConnected ? "connected" : "disconnected"}
						active={isConnected}
					/>
					<StatusRow label="Session" value={hasSession ? "active" : "none"} active={hasSession} />
					<span className="text-muted-foreground">Active chain:</span>
					<Select value={chainId} onValueChange={onChainChange}>
						<SelectTrigger className="w-56">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{liquidNetworks.map((network) => (
								<SelectItem key={network.caipNetworkId} value={network.caipNetworkId}>
									{network.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				{isConnected ? (
					<p className="text-muted-foreground text-sm">
						Connected as{" "}
						<code className="text-foreground font-mono text-xs">{truncateAddress(address)}</code>
					</p>
				) : null}

				<div className="flex flex-wrap gap-2">
					{isConnected ? null : (
						<Button onClick={onConnectAppKit} disabled={pending}>
							Connect (AppKit)
						</Button>
					)}
					<Button variant="outline" onClick={() => call(onCreateSession)} disabled={pending}>
						Create session (direct)
					</Button>
					{isConnected ? (
						<Button variant="outline" onClick={() => call(onDisconnect)} disabled={pending}>
							Disconnect
						</Button>
					) : null}
				</div>
				<ResultPanel result={result} />
			</CardContent>
		</Card>
	);
}

function SessionCard({
	chainId,
	onRefresh,
	policyFor,
	sessionResult,
}: {
	chainId: string;
	onRefresh: () => void;
	policyFor: (method: string) => MethodState;
	sessionResult: Caip25GetSessionResult | null;
}) {
	const session = sessionResult?.sessionScopes ?? null;
	const scope = session?.[chainId];
	const hasSession = Boolean(session && Object.keys(session).length);

	return (
		<Card>
			<CardHeader>
				<CardTitle>Session &amp; permissions</CardTitle>
				<CardDescription>
					wallet_getSession for the active chain. Every listed method is callable;
					humid_methodPolicy marks which run silently and which prompt for confirmation on every
					call (decline yields a 4001 error).
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{!hasSession ? (
					<p className="text-muted-foreground text-sm">
						No active session. Connect or create a session above.
					</p>
				) : (
					<>
						<PolicyLegend />
						<div className="grid gap-2 md:grid-cols-2">
							{liquidWalletRpcMethods.map((method) => (
								<div
									key={method}
									className="flex items-center justify-between rounded-md border p-2"
								>
									<code className="text-xs">{method}</code>
									<PolicyBadge state={policyFor(method)} />
								</div>
							))}
						</div>
						<div className="text-muted-foreground flex flex-col gap-1 text-xs">
							<span>
								Authorized chains: {session ? Object.keys(session).join(", ") || "none" : "none"}
							</span>
							<span>
								Accounts:{" "}
								{scope?.accounts?.length ? scope.accounts.join(", ") : "(wallet returns none yet)"}
							</span>
						</div>
						<ResultPanel result={{ ok: true, text: formatResult(sessionResult) }} />
					</>
				)}
				<Button variant="outline" onClick={onRefresh} className="w-fit">
					Refresh session
				</Button>
			</CardContent>
		</Card>
	);
}

/**
 * What a real dapp does on connect: auto-invoke only the methods `humid_methodPolicy` marks silent,
 * so balances load without a prompt storm. Needs-approval methods are deliberately skipped here —
 * their own Call buttons trigger the wallet confirmation on demand.
 */
const AUTO_LOAD_READS = ["getBalance", "getUTXOs", "getWalletDescriptor"] as const;

type AutoLoadEntry = { method: string; ok: boolean; outcome: string; state: MethodState };

function AutoLoadCard({
	chainId,
	hasSession,
	invoke,
	policyFor,
}: {
	chainId: string;
	hasSession: boolean;
	invoke: Invoke;
	policyFor: (method: string) => MethodState;
}) {
	const [entries, setEntries] = useState<AutoLoadEntry[] | null>(null);
	const [pending, setPending] = useState(false);

	const run = async () => {
		setPending(true);

		// Fire the silent reads together, exactly as a real dapp would on connect; the skipped
		// (needs-approval / unsupported) ones resolve immediately, so order is preserved.
		const collected = await Promise.all(
			AUTO_LOAD_READS.map(async (method): Promise<AutoLoadEntry> => {
				const state = policyFor(method);
				if (state !== "silent") {
					return {
						method,
						ok: false,
						outcome:
							state === "needs-approval"
								? "skipped — would prompt; use its Call button"
								: "skipped — not in this session's surface",
						state,
					};
				}

				try {
					const value = await invoke(method, autoLoadParams(method, chainId));
					return { method, ok: true, outcome: summarizeResult(value), state };
				} catch (error) {
					return { method, ok: false, outcome: formatError(error), state };
				}
			}),
		);

		setEntries(collected);
		setPending(false);
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>Simulate dapp auto-load</CardTitle>
				<CardDescription>
					Fires only the silent read methods (no prompt) exactly as a real dapp would on connect,
					and leaves needs-approval methods for an explicit user action. Reads humid_methodPolicy to
					decide.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-3">
				<Button className="w-fit" disabled={!hasSession || pending} onClick={run}>
					{pending ? "Loading…" : "Run auto-load"}
				</Button>
				{hasSession ? null : (
					<p className="text-muted-foreground text-sm">Create a session above to try this.</p>
				)}
				{entries?.length ? (
					<ul className="flex flex-col gap-1">
						{entries.map((entry) => (
							<li key={entry.method} className="rounded-md border p-2 text-xs">
								<div className="flex items-center justify-between gap-2">
									<code>{entry.method}</code>
									<PolicyBadge state={entry.state} />
								</div>
								<p
									className={
										entry.ok
											? "text-muted-foreground mt-1 break-all"
											: "mt-1 break-all text-amber-600 dark:text-amber-400"
									}
								>
									{entry.outcome}
								</p>
							</li>
						))}
					</ul>
				) : null}
			</CardContent>
		</Card>
	);
}

function GetBalanceCard({
	chainId,
	invoke,
	policy,
}: {
	chainId: string;
	invoke: Invoke;
	policy: MethodState;
}) {
	const [assetId, setAssetId] = useState(policyAssetIdForChain(chainId));
	const { call, pending, result } = useRpcCall();

	return (
		<RpcCard
			description="Wallet-computed balance for the policy asset or a supplied ELIP-0144 asset id."
			policy={policy}
			title="getBalance"
		>
			<TextField label="Asset id (optional)" onChange={setAssetId} value={assetId} />
			<CallButton
				disabled={pending}
				onClick={() => call(() => invoke("getBalance", optionalParams({ assetId })))}
			/>
			<ResultPanel result={result} />
		</RpcCard>
	);
}

function GetUtxosCard({
	chainId,
	invoke,
	onAddress,
	policy,
}: {
	chainId: string;
	invoke: Invoke;
	onAddress: (address: string) => void;
	policy: MethodState;
}) {
	const [assetId, setAssetId] = useState(policyAssetIdForChain(chainId));
	const { call, pending, result } = useRpcCall();

	return (
		<RpcCard
			description="Wallet UTXOs with safe txOut data. Feeds the first address into signMessage."
			policy={policy}
			title="getUTXOs"
		>
			<TextField label="Asset id (optional)" onChange={setAssetId} value={assetId} />
			<CallButton
				disabled={pending}
				onClick={() =>
					call(async () => {
						const res = await invoke("getUTXOs", optionalParams({ assetId }));
						const first = extractFirstUtxoAddress(res);
						if (first) onAddress(first);
						return res;
					})
				}
			/>
			<ResultPanel result={result} />
		</RpcCard>
	);
}

function GetWalletDescriptorCard({ invoke, policy }: { invoke: Invoke; policy: MethodState }) {
	const [descriptorType, setDescriptorType] = useState("publicWalletDescriptor");
	const [descriptorFormat, setDescriptorFormat] = useState("bip380-bip389-multipath");
	const { call, pending, result } = useRpcCall();

	return (
		<RpcCard
			description="Approved public wallet descriptor. Confidential descriptors return an extension-side error."
			policy={policy}
			title="getWalletDescriptor"
		>
			<div className="grid gap-3 md:grid-cols-2">
				<SelectField
					label="Descriptor type"
					onValueChange={setDescriptorType}
					options={["publicWalletDescriptor", "publicConfidentialDescriptor"]}
					value={descriptorType}
				/>
				<SelectField
					label="Descriptor format"
					onValueChange={setDescriptorFormat}
					options={[
						"bip380-bip389-multipath",
						"bip380-split-branches",
						"elip150-public-ct-bip389-multipath",
						"elip150-public-ct-split-branches",
					]}
					value={descriptorFormat}
				/>
			</div>
			<CallButton
				disabled={pending}
				onClick={() =>
					call(() =>
						invoke("getWalletDescriptor", {
							descriptorFormat: [{ format: descriptorFormat }],
							descriptorType,
						}),
					)
				}
			/>
			<ResultPanel result={result} />
		</RpcCard>
	);
}

function SendTransferCard({
	chainId,
	invoke,
	policy,
}: {
	chainId: string;
	invoke: Invoke;
	policy: MethodState;
}) {
	const [recipientAddress, setRecipientAddress] = useState("");
	const [amount, setAmount] = useState("1000");
	const [assetId, setAssetId] = useState(policyAssetIdForChain(chainId));
	const [memo, setMemo] = useState("");
	const { call, pending, result } = useRpcCall();

	return (
		<RpcCard
			description="Wallet-built transfer. Prompts for confirmation on every call unless humid_methodPolicy marks it silent; decline → 4001."
			policy={policy}
			title="sendTransfer"
		>
			<TextField
				label="Recipient address"
				onChange={setRecipientAddress}
				value={recipientAddress}
			/>
			<div className="grid gap-3 md:grid-cols-2">
				<TextField label="Amount (base units)" onChange={setAmount} value={amount} />
				<TextField label="Asset id (optional)" onChange={setAssetId} value={assetId} />
			</div>
			<TextField label="Memo hex (optional, ≤80 bytes)" onChange={setMemo} value={memo} />
			<CallButton
				disabled={pending}
				onClick={() =>
					call(() =>
						invoke("sendTransfer", optionalParams({ amount, assetId, memo, recipientAddress })),
					)
				}
			/>
			<ResultPanel result={result} />
		</RpcCard>
	);
}

function SignMessageCard({
	invoke,
	knownAddress,
	policy,
}: {
	invoke: Invoke;
	knownAddress: string;
	policy: MethodState;
}) {
	const [address, setAddress] = useState("");
	const [message, setMessage] = useState("Authorize HUMID test dapp");
	const [protocol, setProtocol] = useState("ecdsa");
	const { call, pending, result } = useRpcCall();
	const effectiveAddress = address || knownAddress;

	return (
		<RpcCard
			description="Signs with the spend key for a wallet-owned address. Use an address from getUTXOs."
			policy={policy}
			title="signMessage"
		>
			<TextField
				label="Wallet-owned address"
				onChange={setAddress}
				placeholder={knownAddress || "run getUTXOs first"}
				value={effectiveAddress}
			/>
			<TextField label="Message" onChange={setMessage} value={message} />
			<SelectField
				label="Protocol"
				onValueChange={setProtocol}
				options={["ecdsa", "bip322"]}
				value={protocol}
			/>
			<CallButton
				disabled={pending}
				onClick={() =>
					call(() =>
						invoke("signMessage", {
							address: effectiveAddress,
							message,
							protocol,
						}),
					)
				}
			/>
			<ResultPanel result={result} />
		</RpcCard>
	);
}

function SignPsetCard({ invoke, policy }: { invoke: Invoke; policy: MethodState }) {
	const [pset, setPset] = useState("");
	const [signInputs, setSignInputs] = useState('[{"index":0,"address":"","sighashTypes":[1]}]');
	const [broadcast, setBroadcast] = useState(false);
	const { call, pending, result } = useRpcCall();

	return (
		<RpcCard
			description="Signs the listed PSET inputs. Over-signing is rejected. Prompts for confirmation unless marked silent; decline → 4001."
			policy={policy}
			title="signPset"
		>
			<TextAreaField
				label="PSET base64"
				onChange={setPset}
				placeholder="cHNldP8B..."
				value={pset}
			/>
			<TextAreaField label="signInputs JSON" onChange={setSignInputs} value={signInputs} />
			<CheckboxField checked={broadcast} label="Broadcast after signing" onChange={setBroadcast} />
			<CallButton
				disabled={pending}
				onClick={() =>
					call(() =>
						invoke("signPset", {
							broadcast,
							pset: pset.trim(),
							signInputs: parseJsonInput(signInputs),
						}),
					)
				}
			/>
			<ResultPanel result={result} />
		</RpcCard>
	);
}

function GetIdentityPublicKeyCard({ invoke, policy }: { invoke: Invoke; policy: MethodState }) {
	const [identity, setIdentity] = useState(DEFAULT_IDENTITY);
	const [index, setIndex] = useState("0");
	const { call, pending, result } = useRpcCall();

	return (
		<RpcCard
			description="Deterministic SLIP-0013 identity public key (nist256p1)."
			policy={policy}
			title="getIdentityPublicKey"
		>
			<div className="grid gap-3 md:grid-cols-2">
				<TextField label="Identity URI" onChange={setIdentity} value={identity} />
				<TextField label="Index" onChange={setIndex} value={index} />
			</div>
			<CallButton
				disabled={pending}
				onClick={() =>
					call(() =>
						invoke("getIdentityPublicKey", {
							curve: "nist256p1",
							identity,
							index: Number(index),
						}),
					)
				}
			/>
			<ResultPanel result={result} />
		</RpcCard>
	);
}

function GetIdentitySharedKeyCard({ invoke, policy }: { invoke: Invoke; policy: MethodState }) {
	const [identity, setIdentity] = useState(DEFAULT_IDENTITY);
	const [index, setIndex] = useState("0");
	const [theirPublicKey, setTheirPublicKey] = useState("");
	const [kdfInfo, setKdfInfo] = useState(DEFAULT_KDF_INFO);
	const [kdfSalt, setKdfSalt] = useState("");
	const { call, pending, result } = useRpcCall();

	return (
		<RpcCard
			description="SLIP-0017 shared key (ECDH → HKDF-SHA256) with a peer nist256p1 public key."
			policy={policy}
			title="getIdentitySharedKey"
		>
			<div className="grid gap-3 md:grid-cols-2">
				<TextField label="Identity URI" onChange={setIdentity} value={identity} />
				<TextField label="Index" onChange={setIndex} value={index} />
			</div>
			<TextField
				label="Their public key (uncompressed hex)"
				onChange={setTheirPublicKey}
				value={theirPublicKey}
			/>
			<div className="grid gap-3 md:grid-cols-2">
				<TextField label="KDF info hex" onChange={setKdfInfo} value={kdfInfo} />
				<TextField label="KDF salt hex" onChange={setKdfSalt} value={kdfSalt} />
			</div>
			<CallButton
				disabled={pending}
				onClick={() =>
					call(() =>
						invoke("getIdentitySharedKey", {
							curve: "nist256p1",
							identity,
							index: Number(index),
							kdf: "hkdf-sha256",
							kdfInfo,
							kdfSalt,
							theirPublicKey,
						}),
					)
				}
			/>
			<ResultPanel result={result} />
		</RpcCard>
	);
}

function SignIdentityCard({ invoke, policy }: { invoke: Invoke; policy: MethodState }) {
	const [identity, setIdentity] = useState(DEFAULT_IDENTITY);
	const [index, setIndex] = useState("0");
	const [challenge, setChallenge] = useState(DEFAULT_IDENTITY_CHALLENGE);
	const { call, pending, result } = useRpcCall();

	return (
		<RpcCard
			description="Signs a hex identity challenge with the SLIP-0013 identity key."
			policy={policy}
			title="signIdentity"
		>
			<div className="grid gap-3 md:grid-cols-2">
				<TextField label="Identity URI" onChange={setIdentity} value={identity} />
				<TextField label="Index" onChange={setIndex} value={index} />
			</div>
			<TextAreaField label="Challenge hex" onChange={setChallenge} value={challenge} />
			<CallButton
				disabled={pending}
				onClick={() =>
					call(() =>
						invoke("signIdentity", {
							challenge,
							curve: "nist256p1",
							identity,
							index: Number(index),
						}),
					)
				}
			/>
			<ResultPanel result={result} />
		</RpcCard>
	);
}

function ProcessCtCard({ invoke, policy }: { invoke: Invoke; policy: MethodState }) {
	const [payload, setPayload] = useState("{}");
	const { call, pending, result } = useRpcCall();

	return (
		<RpcCard
			description="Wallet ABI method. The extension returns a structured not_implemented error."
			policy={policy}
			title="processConfidentialTransaction"
		>
			<TextAreaField label="Wallet ABI request JSON" onChange={setPayload} value={payload} />
			<CallButton
				disabled={pending}
				onClick={() =>
					call(() => invoke("processConfidentialTransaction", parseJsonInput(payload)))
				}
			/>
			<ResultPanel result={result} />
		</RpcCard>
	);
}

/* ---------- shared building blocks ---------- */

type CallResult = { ok: boolean; text: string };

function useRpcCall() {
	const [result, setResult] = useState<CallResult | null>(null);
	const [pending, setPending] = useState(false);

	const call = async (job: () => Promise<unknown>) => {
		setPending(true);
		try {
			const value = await job();
			setResult({ ok: true, text: formatResult(value) });
		} catch (error) {
			setResult({ ok: false, text: formatError(error) });
		} finally {
			setPending(false);
		}
	};

	return { call, pending, result };
}

function RpcCard({
	children,
	description,
	policy,
	title,
}: {
	children: ReactNode;
	description: string;
	policy?: MethodState;
	title: string;
}) {
	return (
		<Card>
			<CardHeader>
				<div className="flex items-center justify-between gap-2">
					<CardTitle className="font-mono text-base">{title}</CardTitle>
					{policy !== undefined && <PolicyBadge state={policy} />}
				</div>
				<CardDescription>{description}</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-3">{children}</CardContent>
		</Card>
	);
}

function CallButton({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
	return (
		<Button onClick={onClick} disabled={disabled} className="w-fit">
			{disabled ? "Calling…" : "Call"}
		</Button>
	);
}

function ResultPanel({ result }: { result: CallResult | null }) {
	if (!result) return null;

	return (
		<div
			className={
				result.ok
					? "bg-muted rounded-md p-3"
					: "rounded-md border border-red-500/30 bg-red-500/10 p-3"
			}
		>
			<p
				className={
					result.ok
						? "text-muted-foreground mb-1 text-xs font-medium"
						: "mb-1 text-xs font-medium text-red-600"
				}
			>
				{result.ok ? "Result" : "Error"}
			</p>
			<code className="text-xs break-all whitespace-pre-wrap">{result.text}</code>
		</div>
	);
}

function StatusRow({ active, label, value }: { active?: boolean; label: string; value: string }) {
	return (
		<div className="flex items-center gap-2">
			<span className="text-muted-foreground">{label}:</span>
			<Badge variant={active ? "default" : "secondary"}>{value}</Badge>
		</div>
	);
}

function TextField({
	label,
	onChange,
	placeholder,
	value,
}: {
	label: string;
	onChange: (value: string) => void;
	placeholder?: string;
	value: string;
}) {
	const id = useId();

	return (
		<div className="flex flex-col gap-2">
			<Label htmlFor={id}>{label}</Label>
			<Input
				id={id}
				value={value}
				onChange={(event) => onChange(event.target.value)}
				placeholder={placeholder}
				className="font-mono text-xs"
			/>
		</div>
	);
}

function TextAreaField({
	label,
	onChange,
	placeholder,
	value,
}: {
	label: string;
	onChange: (value: string) => void;
	placeholder?: string;
	value: string;
}) {
	const id = useId();

	return (
		<div className="flex flex-col gap-2">
			<Label htmlFor={id}>{label}</Label>
			<textarea
				id={id}
				className="border-input bg-background focus-visible:ring-ring min-h-24 w-full resize-y rounded-md border px-3 py-2 font-mono text-xs focus-visible:ring-2 focus-visible:outline-none"
				value={value}
				onChange={(event) => onChange(event.target.value)}
				placeholder={placeholder}
				spellCheck={false}
			/>
		</div>
	);
}

function SelectField({
	label,
	onValueChange,
	options,
	value,
}: {
	label: string;
	onValueChange: (value: string) => void;
	options: string[];
	value: string;
}) {
	return (
		<div className="flex flex-col gap-2">
			<Label>{label}</Label>
			<Select value={value} onValueChange={onValueChange}>
				<SelectTrigger className="w-full">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{options.map((option) => (
						<SelectItem key={option} value={option}>
							{option}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}

function CheckboxField({
	checked,
	label,
	onChange,
}: {
	checked: boolean;
	label: string;
	onChange: (checked: boolean) => void;
}) {
	const id = useId();

	return (
		<div className="flex items-center gap-2">
			<Checkbox id={id} checked={checked} onCheckedChange={(value) => onChange(value === true)} />
			<Label htmlFor={id}>{label}</Label>
		</div>
	);
}

/* ---------- helpers ---------- */

function buildAllScopes(): Caip25Scopes {
	return Object.fromEntries(
		liquidNetworks.map((network) => [
			network.caipNetworkId,
			{
				methods: [...liquidWalletRpcMethods],
				notifications: [LIQUID_DESCRIPTOR_CHANGED_EVENT],
			},
		]),
	);
}

/** Shorten a wallet address for the connected indicator: first 6 + last 4, e.g. tb1qab…7890. */
function truncateAddress(address: string | undefined): string {
	if (!address) return "";
	return address.length <= 10 ? address : `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function policyAssetIdForChain(chainId: string): string {
	if (chainId === LIQUID_MAINNET_CHAIN_ID) return LIQUID_MAINNET_LBTC_ASSET_ID;
	if (chainId === LIQUID_TESTNET_CHAIN_ID) return LIQUID_TESTNET_LBTC_ASSET_ID;

	return "";
}

/** Default params for the auto-load reads, matching each method's own card defaults. */
function autoLoadParams(method: string, chainId: string): unknown {
	switch (method) {
		case "getBalance":
		case "getUTXOs":
			return optionalParams({ assetId: policyAssetIdForChain(chainId) });
		case "getWalletDescriptor":
			return {
				descriptorFormat: [{ format: "bip380-bip389-multipath" }],
				descriptorType: "publicWalletDescriptor",
			};
		default:
			return undefined;
	}
}

/** Keep the auto-load report compact — the per-method cards show the full payload. */
function summarizeResult(value: unknown): string {
	const text = formatResult(value);
	return text.length > 200 ? `${text.slice(0, 200)}…` : text;
}

function optionalParams(
	params: Record<string, string | undefined>,
): Record<string, string> | undefined {
	const cleaned = Object.fromEntries(
		Object.entries(params).flatMap(([key, value]) => {
			const normalized = value?.trim();
			return normalized ? [[key, normalized]] : [];
		}),
	);

	return Object.keys(cleaned).length > 0 ? cleaned : undefined;
}

function parseJsonInput(value: string): unknown {
	const trimmed = value.trim();
	if (!trimmed) return undefined;
	return JSON.parse(trimmed);
}

function formatResult(value: unknown): string {
	if (typeof value === "string") {
		try {
			return JSON.stringify(JSON.parse(value), null, 2);
		} catch {
			return value;
		}
	}

	return JSON.stringify(value, null, 2);
}

function formatError(error: unknown): string {
	if (error instanceof Error) return error.message;
	return formatResult(error);
}

function extractFirstUtxoAddress(value: unknown): string | null {
	const parsed = typeof value === "string" ? safeJsonParse(value) : value;
	if (!isRecord(parsed) || !Array.isArray(parsed.utxos)) return null;

	const firstUtxo = parsed.utxos.find(isRecord);
	const address = firstUtxo?.address;

	return typeof address === "string" ? address : null;
}

function safeJsonParse(value: string): unknown {
	try {
		return JSON.parse(value);
	} catch {
		return null;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
