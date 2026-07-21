import {
	GlobeIcon,
	Loader2Icon,
	PowerIcon,
	PuzzleIcon,
	RefreshCwIcon,
	WalletIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useHumidContext } from "@/contexts/Web3Provider/HumidProvider";
import { formatLbtc, truncateMiddle } from "@/lib/liquid";

import { IdentityAvatar } from "./IdentityAvatar";
import { useAsyncAction } from "./useAsyncAction";

/** The emotional center of Home: identity + balance, plus the edge states (no provider / connect). */
export function HeroCard() {
	const { hasProvider, isConnected } = useHumidContext();

	if (!hasProvider) return <NoProviderCard />;
	if (!isConnected) return <ConnectCard />;
	return <ConnectedHero />;
}

function NoProviderCard() {
	return (
		<Card>
			<CardContent className="flex flex-col items-center gap-4 py-4 text-center">
				<div className="bg-muted flex size-12 items-center justify-center rounded-full">
					<PuzzleIcon className="text-muted-foreground size-6" />
				</div>
				<div className="flex flex-col gap-1">
					<h1 className="text-base font-medium">HUMID extension not detected</h1>
					<p className="text-muted-foreground text-sm">
						Install the HUMID browser extension and reload this tab to continue.
					</p>
				</div>
				<Button variant="outline" onClick={() => window.location.reload()}>
					<RefreshCwIcon />
					Reload
				</Button>
			</CardContent>
		</Card>
	);
}

function ConnectCard() {
	const { connect } = useHumidContext();
	const action = useAsyncAction<void>();
	const pending = action.status === "pending";

	const onConnect = async () => {
		const result = await action.run(() => connect());
		if (!result.ok) toast.error("Couldn't connect", { description: result.error });
	};

	return (
		<Card>
			<CardContent className="flex flex-col items-center gap-5 py-6 text-center">
				<div className="bg-primary/10 flex size-14 items-center justify-center rounded-full">
					<WalletIcon className="text-primary size-7" />
				</div>
				<div className="flex flex-col gap-1">
					<h1 className="text-lg font-semibold tracking-tight">Welcome to HUMID</h1>
					<p className="text-muted-foreground text-sm">
						Connect your Liquid wallet to view your balance and sign in.
					</p>
				</div>
				<Button className="w-full" disabled={pending} onClick={onConnect}>
					{pending ? (
						<>
							<Loader2Icon className="animate-spin motion-reduce:animate-none" />
							Connecting…
						</>
					) : (
						"Connect wallet"
					)}
				</Button>
			</CardContent>
		</Card>
	);
}

function ConnectedHero() {
	const {
		address,
		balance,
		balanceStatus,
		chainId,
		createSession,
		disconnect,
		identity,
		identityStatus,
		refreshBalance,
		refreshIdentity,
		revokeSession,
		session,
		supportedChains,
		switchNetwork,
	} = useHumidContext();

	const network = supportedChains.find((chain) => chain.caipNetworkId === chainId);
	const ticker = network?.nativeCurrency.symbol ?? "L-BTC";
	const hasSession = Boolean(session && Object.keys(session).length);
	const avatarSeed = identity?.publicKey ?? address;

	const sessionAction = useAsyncAction<void>();

	const onDisconnect = async () => {
		await revokeSession().catch(() => undefined);
		await disconnect().catch(() => undefined);
		toast.success("Disconnected");
	};

	const onCreateSession = async () => {
		const result = await sessionAction.run(() => createSession());
		if (result.ok) toast.success("Session created");
		else toast.error("Couldn't create session", { description: result.error });
	};

	return (
		<Card>
			<CardContent className="flex flex-col gap-6">
				<div className="flex items-center justify-between gap-2">
					<Select value={chainId} onValueChange={switchNetwork}>
						<SelectTrigger size="sm" className="gap-2">
							<span className="flex items-center gap-2">
								<GlobeIcon className="text-muted-foreground size-3.5" />
								<SelectValue />
							</span>
						</SelectTrigger>
						<SelectContent>
							{supportedChains.map((chain) => (
								<SelectItem key={chain.caipNetworkId} value={chain.caipNetworkId}>
									{chain.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>

					<div className="flex items-center gap-2">
						<span className="text-muted-foreground flex items-center gap-1.5 text-xs">
							<span className="size-2 rounded-full bg-emerald-500" aria-hidden="true" />
							Connected
						</span>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button variant="ghost" size="icon-sm" onClick={onDisconnect}>
									<PowerIcon />
									<span className="sr-only">Disconnect</span>
								</Button>
							</TooltipTrigger>
							<TooltipContent>Disconnect</TooltipContent>
						</Tooltip>
					</div>
				</div>

				<div className="flex items-center gap-4">
					<IdentityAvatar seed={avatarSeed} />
					<div className="flex min-w-0 flex-col gap-1">
						<IdentityLines
							address={address}
							identityLabel={identity?.label}
							status={identityStatus}
							onReveal={refreshIdentity}
						/>
					</div>
				</div>

				<div className="flex flex-col gap-1">
					<span className="text-muted-foreground text-xs font-medium">Balance</span>
					<BalanceValue
						amount={balance}
						networkName={network?.name}
						status={balanceStatus}
						ticker={ticker}
						onReveal={refreshBalance}
					/>
				</div>

				{hasSession ? null : (
					<div className="border-border bg-muted/40 flex flex-col gap-2 rounded-lg border p-3">
						<p className="text-muted-foreground text-xs">
							Approve a session to load your balance and identity automatically.
						</p>
						<Button
							variant="secondary"
							size="sm"
							className="w-fit"
							disabled={sessionAction.status === "pending"}
							onClick={onCreateSession}
						>
							{sessionAction.status === "pending" ? (
								<>
									<Loader2Icon className="animate-spin motion-reduce:animate-none" />
									Creating…
								</>
							) : (
								"Create session"
							)}
						</Button>
					</div>
				)}
			</CardContent>
		</Card>
	);
}

function IdentityLines({
	address,
	identityLabel,
	status,
	onReveal,
}: {
	address: string;
	identityLabel: string | undefined;
	status: string;
	onReveal: () => void;
}) {
	if (status === "loading" || status === "idle") {
		return (
			<>
				<Skeleton className="h-4 w-28" />
				<Skeleton className="h-3 w-40" />
			</>
		);
	}

	if (status === "needs-approval") {
		return (
			<>
				<span className="truncate font-mono text-sm font-medium">{truncateMiddle(address)}</span>
				<Button
					variant="link"
					size="xs"
					className="text-muted-foreground h-auto w-fit p-0 text-xs"
					onClick={onReveal}
				>
					Reveal identity
				</Button>
			</>
		);
	}

	if (status === "error") {
		return (
			<>
				<span className="text-sm font-medium">Identity unavailable</span>
				<Button
					variant="link"
					size="xs"
					className="text-muted-foreground h-auto w-fit p-0 text-xs"
					onClick={onReveal}
				>
					Retry
				</Button>
			</>
		);
	}

	return (
		<>
			<span className="truncate text-sm font-medium">
				{identityLabel ?? truncateMiddle(address)}
			</span>
			<span className="text-muted-foreground truncate font-mono text-xs">
				{truncateMiddle(address, 10, 6)}
			</span>
		</>
	);
}

function BalanceValue({
	amount,
	networkName,
	status,
	ticker,
	onReveal,
}: {
	amount: bigint;
	networkName: string | undefined;
	status: string;
	ticker: string;
	onReveal: () => void;
}) {
	if (status === "loading" || status === "idle") {
		return <Skeleton className="mt-1 h-9 w-44" />;
	}

	if (status === "needs-approval") {
		return (
			<Button variant="outline" size="sm" className="mt-1 w-fit" onClick={onReveal}>
				Show balance
			</Button>
		);
	}

	if (status === "error") {
		return (
			<div className="text-muted-foreground mt-1 flex items-center gap-2 text-sm">
				Couldn&apos;t load balance
				<Button
					variant="link"
					size="xs"
					className="text-muted-foreground h-auto p-0 text-xs"
					onClick={onReveal}
				>
					Retry
				</Button>
			</div>
		);
	}

	return (
		<>
			<div className="flex items-baseline gap-2">
				<span className="text-3xl font-semibold tracking-tight tabular-nums">
					{formatLbtc(amount)}
				</span>
				<span className="text-muted-foreground text-sm font-medium">{ticker}</span>
			</div>
			{networkName ? <span className="text-muted-foreground text-xs">{networkName}</span> : null}
		</>
	);
}
