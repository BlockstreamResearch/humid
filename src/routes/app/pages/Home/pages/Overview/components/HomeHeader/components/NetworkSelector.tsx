import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { useHome } from "@/routes/App/pages/Home/HomeContext";
import { cn } from "@/theme/utils.ts";
import {
	UiDropdownMenu,
	UiDropdownMenuContent,
	UiDropdownMenuRadioGroup,
	UiDropdownMenuRadioItem,
	UiDropdownMenuTrigger,
} from "@/ui/UiDropdownMenu";

function NetworkDot({ chainId }: { chainId: string }) {
	let hash = 0;

	for (let index = 0; index < chainId.length; index += 1) {
		hash = (Math.imul(hash, 31) + chainId.charCodeAt(index)) | 0;
	}

	return (
		<span
			className="size-2 shrink-0 rounded-full"
			style={{ backgroundColor: `hsl(${Math.abs(hash) % 360} 65% 50%)` }}
		/>
	);
}

/** Network switcher — renders every chain in the store; no chain-specific logic. */
export function NetworkSelector() {
	const { chain, chains, selectChain } = useHome();

	return (
		<UiDropdownMenu>
			<UiDropdownMenuTrigger
				className={cn(
					"hover:bg-accent flex items-center gap-1.5 rounded-full py-1 pr-1.5 pl-2",
					"text-xs font-medium tracking-wide uppercase transition-colors",
				)}
			>
				<NetworkDot chainId={chain.id} />
				{chain.name}
				<HugeiconsIcon icon={ArrowDown01Icon} size={14} className="text-muted-foreground" />
			</UiDropdownMenuTrigger>
			<UiDropdownMenuContent align="start" className="min-w-44">
				<UiDropdownMenuRadioGroup value={chain.id} onValueChange={selectChain}>
					{chains.map((option) => (
						<UiDropdownMenuRadioItem
							key={option.id}
							closeOnClick
							value={option.id}
							className="gap-2"
						>
							<NetworkDot chainId={option.id} />
							{option.name}
						</UiDropdownMenuRadioItem>
					))}
				</UiDropdownMenuRadioGroup>
			</UiDropdownMenuContent>
		</UiDropdownMenu>
	);
}
