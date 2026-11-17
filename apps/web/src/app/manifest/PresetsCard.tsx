import {
	LIQUID_REGTEST_CHAIN_ID,
	type LiquidProcessConfidentialTransactionParams,
} from "@humid/appkit-injected-adapter";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useHumidContext } from "@/contexts/Web3Provider/HumidProvider";

import type { SentStep } from "./Preset";
import { PRESETS } from "./presets";
import { walletKeyOf } from "./walletKey";

export function PresetsCard({
	sent,
	onPick,
}: {
	sent: Record<string, SentStep[]>;
	onPick: (
		request: LiquidProcessConfidentialTransactionParams,
		origin: { action: string; preset: string },
	) => void;
}) {
	const { chainId, supportedChains, switchNetwork, wallet } = useHumidContext();
	const network = supportedChains.find((chain) => chain.caipNetworkId === chainId)?.name ?? chainId;
	const [key, setKey] = useState<string | null>(null);
	const [problem, setProblem] = useState<string | null>(null);

	const readKey = async () => {
		try {
			const { descriptors } = await wallet.getWalletDescriptor({
				descriptorFormat: [{ format: "bip380-bip389-multipath" }],
				descriptorType: "publicWalletDescriptor",
			});

			setKey(walletKeyOf(descriptors[0]?.descriptor ?? ""));
			setProblem(null);
		} catch (error) {
			setProblem(error instanceof Error ? error.message : String(error));
		}
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>Presets</CardTitle>
				<CardDescription>
					Contract lifecycles from the tx-manifest fixtures, sent for real. Run them on Local
					regtest, started with bun run regtest. Each step after the first spends what an earlier
					step sent, so the steps unlock as they go out.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<div className="flex flex-wrap items-center gap-3 text-sm">
					<Button variant="outline" size="sm" onClick={readKey}>
						{key === null ? "Read the wallet key" : "Read the key again"}
					</Button>
					<span className="text-muted-foreground font-mono text-xs break-all">
						{key ??
							"Every preset locks funds to this key, read from the wallet's public descriptor."}
					</span>
				</div>
				{chainId !== LIQUID_REGTEST_CHAIN_ID && (
					<div className="flex flex-wrap items-center gap-3 text-sm text-amber-600 dark:text-amber-500">
						<span>The dapp is on {network}, so these would go out there.</span>
						<Button
							variant="outline"
							size="sm"
							onClick={() => {
								setKey(null);
								switchNetwork(LIQUID_REGTEST_CHAIN_ID);
							}}
						>
							Use Local regtest
						</Button>
					</div>
				)}
				{problem !== null && <p className="text-destructive text-sm">{problem}</p>}

				{PRESETS.map((preset) => (
					<div key={preset.name} className="flex flex-col gap-2">
						<div>
							<p className="font-mono text-sm font-semibold">{preset.name}</p>
							<p className="text-muted-foreground text-xs">{preset.description}</p>
						</div>
						<div className="flex flex-wrap gap-2">
							{preset.steps.map((step) => {
								const request =
									key === null ? undefined : preset.request(step, key, sent[preset.name] ?? []);

								return (
									<Button
										key={step.action}
										variant="secondary"
										size="sm"
										disabled={request === undefined}
										onClick={() =>
											request && onPick(request, { action: step.action, preset: preset.name })
										}
									>
										{step.action}
									</Button>
								);
							})}
						</div>
					</div>
				))}
			</CardContent>
		</Card>
	);
}
