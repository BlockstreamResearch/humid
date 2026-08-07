import { Button } from "@/components/ui/button";
import { useHumidContext } from "@/contexts/Web3Provider/HumidProvider";

import { HeroCard } from "./components/HeroCard";
import { HomeActions } from "./components/HomeActions";

/**
 * The product Home: an identity-first hero (network, "signed in as", balance) with a row of primary
 * actions. A thin consumer of {@link useHumidContext} — all wallet plumbing lives in the context.
 */
export default function Home({
	onOpenDeveloper,
	onOpenManifestInspector,
}: {
	onOpenDeveloper: () => void;
	onOpenManifestInspector: () => void;
}) {
	const { hasProvider, isConnected } = useHumidContext();

	return (
		<div className="mx-auto flex min-h-svh w-full max-w-md flex-col gap-6 px-4 py-10 sm:py-16">
			<header className="flex items-center gap-2 px-1">
				<span className="text-sm font-semibold tracking-tight">HUMID</span>
				<span className="text-muted-foreground text-sm">Liquid Wallet</span>
			</header>

			<HeroCard />
			{hasProvider && isConnected ? <HomeActions /> : null}

			{/* The inspector sits beside Developer rather than inside it: the cards there are all
			    ways of driving a wallet and disappear when none is installed, which is exactly
			    when reading a document by itself is most useful. */}
			<div className="mt-auto flex justify-center gap-1 pt-6">
				<Button
					variant="ghost"
					size="sm"
					className="text-muted-foreground text-xs"
					onClick={onOpenDeveloper}
				>
					Developer
				</Button>
				<Button
					variant="ghost"
					size="sm"
					className="text-muted-foreground text-xs"
					onClick={onOpenManifestInspector}
				>
					Manifest inspector
				</Button>
			</div>
		</div>
	);
}
