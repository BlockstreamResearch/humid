import { liquidWalletRpcMethods } from "@humid/appkit-injected-adapter";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useHumidContext } from "@/contexts/Web3Provider/HumidProvider";

import { formatResult } from "../lib/format";
import { methodState } from "../lib/method-state";
import { PolicyBadge, PolicyLegend } from "./PolicyBadge";
import { ResultPanel } from "./ResultPanel";

export function SessionCard() {
	const { chainId, isSilent, refreshSession, session } = useHumidContext();

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
									<PolicyBadge state={methodState(method, session, chainId, isSilent)} />
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
						<ResultPanel result={{ ok: true, text: formatResult(session) }} />
					</>
				)}
				<Button variant="outline" onClick={refreshSession} className="w-fit">
					Refresh session
				</Button>
			</CardContent>
		</Card>
	);
}
