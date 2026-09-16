import { Button } from "@/components/ui/button";
import { useHumidContext } from "@/contexts/Web3Provider/HumidProvider";

import { HeroCard } from "./components/HeroCard";
import { HomeActions } from "./components/HomeActions";

export default function Home({
	onOpenDeveloper,
	onOpenFormatSupport,
	onOpenManifestInspector,
}: {
	onOpenDeveloper: () => void;
	onOpenFormatSupport: () => void;
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

			<div className="mt-auto flex flex-wrap justify-center gap-1 pt-6">
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
				<Button
					variant="ghost"
					size="sm"
					className="text-muted-foreground text-xs"
					onClick={onOpenFormatSupport}
				>
					Format support
				</Button>
			</div>
		</div>
	);
}
