import {
	getSession,
	LIQUID_DESCRIPTOR_CHANGED_EVENT,
	type CaipRpcProvider,
} from "@humid/appkit-injected-adapter";
import { useCallback, useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type WalletEventLogEntry = {
	at: string;
	id: number;
	name: string;
	payload: unknown;
	resolvedAccounts?: string[];
};

const WALLET_EVENT_NAMES = [
	"accountsChanged",
	"chainChanged",
	"connect",
	"disconnect",
	"wallet_sessionChanged",
	LIQUID_DESCRIPTOR_CHANGED_EVENT,
];

const ACCOUNT_RELEVANT_EVENTS = new Set([
	"accountsChanged",
	"connect",
	"wallet_sessionChanged",
	LIQUID_DESCRIPTOR_CHANGED_EVENT,
]);

function useDebugWalletEvents(): { clear: () => void; log: WalletEventLogEntry[] } {
	const [log, setLog] = useState<WalletEventLogEntry[]>([]);
	const counterRef = useRef(0);

	useEffect(() => {
		const humid = window.humid;
		if (!humid?.on) return;

		const on = humid.on;
		const provider = humid as CaipRpcProvider;
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

					if (ACCOUNT_RELEVANT_EVENTS.has(name)) {
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
	}, []);

	const clear = useCallback(() => setLog([]), []);

	return { clear, log };
}

export function EventLogCard() {
	const { clear, log } = useDebugWalletEvents();

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
					<Button size="sm" variant="outline" onClick={clear} disabled={log.length === 0}>
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
