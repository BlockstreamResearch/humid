import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useHumidContext } from "@/contexts/Web3Provider/HumidProvider";

import { truncateAddress } from "../lib/format";
import { useRpcCall } from "../lib/useRpcCall";
import { ResultPanel } from "./ResultPanel";
import { StatusRow } from "./StatusRow";

export function ConnectionCard() {
	const {
		address,
		chainId,
		connect,
		createSession,
		disconnect,
		isConnected,
		revokeSession,
		session,
		supportedChains,
		switchNetwork,
	} = useHumidContext();
	const { call, pending, result } = useRpcCall();

	const hasSession = Boolean(session && Object.keys(session).length);

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
					<Select value={chainId} onValueChange={switchNetwork}>
						<SelectTrigger className="w-56">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{supportedChains.map((network) => (
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
						<Button onClick={() => call(connect)} disabled={pending}>
							Connect (AppKit)
						</Button>
					)}
					<Button variant="outline" onClick={() => call(createSession)} disabled={pending}>
						Create session (direct)
					</Button>
					{isConnected ? (
						<Button
							variant="outline"
							onClick={() =>
								call(async () => {
									// Match the old Disconnect: drop the session, then the AppKit connection.
									await revokeSession().catch(() => undefined);
									await disconnect().catch(() => undefined);
								})
							}
							disabled={pending}
						>
							Disconnect
						</Button>
					) : null}
				</div>
				<ResultPanel result={result} />
			</CardContent>
		</Card>
	);
}
