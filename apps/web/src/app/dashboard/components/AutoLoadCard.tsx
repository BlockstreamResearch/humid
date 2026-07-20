import type { WalletClient } from "@humid/appkit-injected-adapter";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useHumidContext } from "@/contexts/Web3Provider/HumidProvider";

import { policyAssetIdForChain } from "../lib/constants";
import { formatError, summarizeResult } from "../lib/format";
import { methodState, type MethodState } from "../lib/method-state";
import { PolicyBadge } from "./PolicyBadge";

/**
 * What a real dapp does on connect: auto-invoke only the methods `humid_methodPolicy` marks silent,
 * so balances load without a prompt storm. Needs-approval methods are deliberately skipped here —
 * their own Call buttons trigger the wallet confirmation on demand.
 */
const AUTO_LOAD_READS = ["getBalance", "getUTXOs", "getWalletDescriptor"] as const;
type AutoLoadRead = (typeof AUTO_LOAD_READS)[number];

type AutoLoadEntry = { method: string; ok: boolean; outcome: string; state: MethodState };

export function AutoLoadCard() {
	const { chainId, isSilent, session, wallet } = useHumidContext();

	const hasSession = Boolean(session && Object.keys(session).length);
	const [entries, setEntries] = useState<AutoLoadEntry[] | null>(null);
	const [pending, setPending] = useState(false);

	const run = async () => {
		setPending(true);

		// Fire the silent reads together, exactly as a real dapp would on connect; the skipped
		// (needs-approval / unsupported) ones resolve immediately, so order is preserved.
		const collected = await Promise.all(
			AUTO_LOAD_READS.map(async (method): Promise<AutoLoadEntry> => {
				const state = methodState(method, session, chainId, isSilent);
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
					const value = await runAutoLoadRead(method, wallet, chainId);
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

/** Run one silent read through the typed client, matching each method's own card defaults. */
function runAutoLoadRead(
	method: AutoLoadRead,
	wallet: WalletClient,
	chainId: string,
): Promise<unknown> {
	const assetId = policyAssetIdForChain(chainId);

	switch (method) {
		case "getBalance":
			return wallet.getBalance(assetId ? { assetId } : undefined);
		case "getUTXOs":
			return wallet.getUTXOs(assetId ? { assetId } : undefined);
		case "getWalletDescriptor":
			return wallet.getWalletDescriptor({
				descriptorFormat: [{ format: "bip380-bip389-multipath" }],
				descriptorType: "publicWalletDescriptor",
			});
	}
}
