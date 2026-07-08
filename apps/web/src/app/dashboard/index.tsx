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
	revokeSession,
	type Caip25Scopes,
	type CaipRpcProvider,
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
	const [session, setSession] = useState<Caip25Scopes | null>(null);
	const [knownAddress, setKnownAddress] = useState("");

	const loadSession = () => {
		if (!provider) return;
		getSession(provider)
			.then((result) => setSession(result.sessionScopes))
			.catch(() => setSession(null));
	};

	// Poll the session so the permission badges / status stay live after connect or disconnect
	// without a manual refresh (wallet_getSession is a read-only call — no wallet prompt).
	useEffect(() => {
		if (!provider) return;

		let cancelled = false;

		const load = () => {
			getSession(provider)
				.then((result) => {
					if (!cancelled) setSession(result.sessionScopes);
				})
				.catch(() => {
					if (!cancelled) setSession(null);
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

	const grantedMethods = new Set(session?.[chainId]?.methods ?? []);
	const isGranted = (method: string) => grantedMethods.has(method);

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

			<SessionCard chainId={chainId} onRefresh={loadSession} session={session} />

			<EventLogCard log={eventLog} onClear={clearEvents} />

			<GetBalanceCard chainId={chainId} granted={isGranted("getBalance")} invoke={invoke} />
			<GetUtxosCard
				chainId={chainId}
				granted={isGranted("getUTXOs")}
				invoke={invoke}
				onAddress={setKnownAddress}
			/>
			<GetWalletDescriptorCard granted={isGranted("getWalletDescriptor")} invoke={invoke} />
			<SendTransferCard chainId={chainId} granted={isGranted("sendTransfer")} invoke={invoke} />
			<SignMessageCard
				granted={isGranted("signMessage")}
				invoke={invoke}
				knownAddress={knownAddress}
			/>
			<SignPsetCard granted={isGranted("signPset")} invoke={invoke} />
			<GetIdentityPublicKeyCard granted={isGranted("getIdentityPublicKey")} invoke={invoke} />
			<GetIdentitySharedKeyCard granted={isGranted("getIdentitySharedKey")} invoke={invoke} />
			<SignIdentityCard granted={isGranted("signIdentity")} invoke={invoke} />
			<ProcessCtCard granted={isGranted("processConfidentialTransaction")} invoke={invoke} />
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
					Injected window.humid, CAIP-25/27. Every method has its own card below and prints the raw
					result or error, including RESTRICTED responses.
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
	session,
}: {
	chainId: string;
	onRefresh: () => void;
	session: Caip25Scopes | null;
}) {
	const scope = session?.[chainId];
	const granted = new Set(scope?.methods ?? []);

	return (
		<Card>
			<CardHeader>
				<CardTitle>Session &amp; permissions</CardTitle>
				<CardDescription>
					wallet_getSession for the active chain. Withheld reads return RESTRICTED; withheld actions
					are refused.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{!session || !Object.keys(session).length ? (
					<p className="text-muted-foreground text-sm">
						No active session. Connect or create a session above.
					</p>
				) : (
					<>
						<div className="grid gap-2 md:grid-cols-2">
							{liquidWalletRpcMethods.map((method) => (
								<div
									key={method}
									className="flex items-center justify-between rounded-md border p-2"
								>
									<code className="text-xs">{method}</code>
									<Badge variant={granted.has(method) ? "default" : "secondary"}>
										{granted.has(method) ? "granted" : "withheld"}
									</Badge>
								</div>
							))}
						</div>
						<div className="text-muted-foreground flex flex-col gap-1 text-xs">
							<span>Authorized chains: {Object.keys(session).join(", ") || "none"}</span>
							<span>
								Accounts:{" "}
								{scope?.accounts?.length ? scope.accounts.join(", ") : "(wallet returns none yet)"}
							</span>
						</div>
						<ResultPanel result={{ ok: true, text: formatResult(session) }} />
					</>
				)}
				<Button variant="outline" onClick={onRefresh} className="w-fit">
					Refresh session
				</Button>
			</CardContent>
		</Card>
	);
}

function GetBalanceCard({
	chainId,
	granted,
	invoke,
}: {
	chainId: string;
	granted: boolean;
	invoke: Invoke;
}) {
	const [assetId, setAssetId] = useState(policyAssetIdForChain(chainId));
	const { call, pending, result } = useRpcCall();

	return (
		<RpcCard
			description="Wallet-computed balance for the policy asset or a supplied ELIP-0144 asset id."
			granted={granted}
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
	granted,
	invoke,
	onAddress,
}: {
	chainId: string;
	granted: boolean;
	invoke: Invoke;
	onAddress: (address: string) => void;
}) {
	const [assetId, setAssetId] = useState(policyAssetIdForChain(chainId));
	const { call, pending, result } = useRpcCall();

	return (
		<RpcCard
			description="Wallet UTXOs with safe txOut data. Feeds the first address into signMessage."
			granted={granted}
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

function GetWalletDescriptorCard({ granted, invoke }: { granted: boolean; invoke: Invoke }) {
	const [descriptorType, setDescriptorType] = useState("publicWalletDescriptor");
	const [descriptorFormat, setDescriptorFormat] = useState("bip380-bip389-multipath");
	const { call, pending, result } = useRpcCall();

	return (
		<RpcCard
			description="Approved public wallet descriptor. Confidential descriptors return an extension-side error."
			granted={granted}
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
	granted,
	invoke,
}: {
	chainId: string;
	granted: boolean;
	invoke: Invoke;
}) {
	const [recipientAddress, setRecipientAddress] = useState("");
	const [amount, setAmount] = useState("1000");
	const [assetId, setAssetId] = useState(policyAssetIdForChain(chainId));
	const [memo, setMemo] = useState("");
	const { call, pending, result } = useRpcCall();

	return (
		<RpcCard
			description="Wallet-built transfer. Requires an approval each time; withheld → 4100."
			granted={granted}
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
	granted,
	invoke,
	knownAddress,
}: {
	granted: boolean;
	invoke: Invoke;
	knownAddress: string;
}) {
	const [address, setAddress] = useState("");
	const [message, setMessage] = useState("Authorize HUMID test dapp");
	const [protocol, setProtocol] = useState("ecdsa");
	const { call, pending, result } = useRpcCall();
	const effectiveAddress = address || knownAddress;

	return (
		<RpcCard
			description="Signs with the spend key for a wallet-owned address. Use an address from getUTXOs."
			granted={granted}
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

function SignPsetCard({ granted, invoke }: { granted: boolean; invoke: Invoke }) {
	const [pset, setPset] = useState("");
	const [signInputs, setSignInputs] = useState('[{"index":0,"address":"","sighashTypes":[1]}]');
	const [broadcast, setBroadcast] = useState(false);
	const { call, pending, result } = useRpcCall();

	return (
		<RpcCard
			description="Signs the listed PSET inputs. Over-signing is rejected; withheld → 4100."
			granted={granted}
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

function GetIdentityPublicKeyCard({ granted, invoke }: { granted: boolean; invoke: Invoke }) {
	const [identity, setIdentity] = useState(DEFAULT_IDENTITY);
	const [index, setIndex] = useState("0");
	const { call, pending, result } = useRpcCall();

	return (
		<RpcCard
			description="Deterministic SLIP-0013 identity public key (nist256p1)."
			granted={granted}
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

function GetIdentitySharedKeyCard({ granted, invoke }: { granted: boolean; invoke: Invoke }) {
	const [identity, setIdentity] = useState(DEFAULT_IDENTITY);
	const [index, setIndex] = useState("0");
	const [theirPublicKey, setTheirPublicKey] = useState("");
	const [kdfInfo, setKdfInfo] = useState(DEFAULT_KDF_INFO);
	const [kdfSalt, setKdfSalt] = useState("");
	const { call, pending, result } = useRpcCall();

	return (
		<RpcCard
			description="SLIP-0017 shared key (ECDH → HKDF-SHA256) with a peer nist256p1 public key."
			granted={granted}
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

function SignIdentityCard({ granted, invoke }: { granted: boolean; invoke: Invoke }) {
	const [identity, setIdentity] = useState(DEFAULT_IDENTITY);
	const [index, setIndex] = useState("0");
	const [challenge, setChallenge] = useState(DEFAULT_IDENTITY_CHALLENGE);
	const { call, pending, result } = useRpcCall();

	return (
		<RpcCard
			description="Signs a hex identity challenge with the SLIP-0013 identity key."
			granted={granted}
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

function ProcessCtCard({ granted, invoke }: { granted: boolean; invoke: Invoke }) {
	const [payload, setPayload] = useState("{}");
	const { call, pending, result } = useRpcCall();

	return (
		<RpcCard
			description="Wallet ABI method. The extension returns a structured not_implemented error."
			granted={granted}
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
	granted,
	title,
}: {
	children: ReactNode;
	description: string;
	granted?: boolean;
	title: string;
}) {
	return (
		<Card>
			<CardHeader>
				<div className="flex items-center justify-between gap-2">
					<CardTitle className="font-mono text-base">{title}</CardTitle>
					{granted !== undefined && (
						<Badge variant={granted ? "default" : "secondary"}>
							{granted ? "granted" : "withheld"}
						</Badge>
					)}
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
