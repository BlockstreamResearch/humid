import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useHumidContext } from "@/contexts/Web3Provider/HumidProvider";

import { AutoLoadCard } from "./components/AutoLoadCard";
import { ConnectionCard } from "./components/ConnectionCard";
import { EventLogCard } from "./components/EventLogCard";
import {
	GetBalanceCard,
	GetIdentityPublicKeyCard,
	GetIdentitySharedKeyCard,
	GetUtxosCard,
	GetWalletDescriptorCard,
	ProcessCtCard,
	SendTransferCard,
	SignIdentityCard,
	SignMessageCard,
	SignPsetCard,
} from "./components/method-cards";
import { SessionCard } from "./components/SessionCard";

export default function Dashboard() {
	return (
		<div className="mx-auto flex min-h-svh w-full max-w-4xl flex-col gap-6 p-4 md:p-6">
			<DebugDashboard />
		</div>
	);
}

/**
 * A thin consumer of {@link useHumidContext}: all wallet plumbing (provider, session, policy, typed
 * calls, events) lives in the context, so this only lays out the cards and shows the two edge states.
 */
function DebugDashboard() {
	const { hasProvider } = useHumidContext();

	// getUTXOs feeds the first wallet-owned address into signMessage — the one bit of shared card state.
	const [knownAddress, setKnownAddress] = useState("");

	if (!hasProvider) return <NotDetectedCard />;

	return (
		<div className="flex max-w-4xl flex-col gap-6">
			<ConnectionCard />
			<SessionCard />
			<AutoLoadCard />
			<EventLogCard />

			<GetBalanceCard />
			<GetUtxosCard onAddress={setKnownAddress} />
			<GetWalletDescriptorCard />
			<SendTransferCard />
			<SignMessageCard knownAddress={knownAddress} />
			<SignPsetCard />
			<GetIdentityPublicKeyCard />
			<GetIdentitySharedKeyCard />
			<SignIdentityCard />
			<ProcessCtCard />
		</div>
	);
}

function NotDetectedCard() {
	return (
		<Card className="max-w-3xl">
			<CardHeader>
				<CardTitle>HUMID extension not detected</CardTitle>
				<CardDescription>
					window.humid is not present on this page. Load the HUMID extension, then reload this tab.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<Button onClick={() => window.location.reload()}>Reload</Button>
			</CardContent>
		</Card>
	);
}
