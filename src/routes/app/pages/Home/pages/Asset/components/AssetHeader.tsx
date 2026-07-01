import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";

/** Asset header: back to Overview, the asset glyph + name, and its unit price. */
export function AssetHeader({
	name,
	price,
	symbol,
}: {
	name: string;
	price: string;
	symbol: string;
}) {
	return (
		<header className="border-border/60 flex shrink-0 items-center gap-2 border-b px-2 py-2.5">
			<Link
				to="/app"
				aria-label="Back"
				className="text-muted-foreground hover:bg-accent hover:text-foreground rounded-md p-1.5 transition-colors"
			>
				<HugeiconsIcon icon={ArrowLeft01Icon} size={18} />
			</Link>
			<div className="bg-muted flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold">
				{symbol.charAt(0)}
			</div>
			<p className="flex-1 truncate text-sm font-semibold">{name}</p>
			<p className="text-muted-foreground font-mono text-sm">{price}</p>
		</header>
	);
}
