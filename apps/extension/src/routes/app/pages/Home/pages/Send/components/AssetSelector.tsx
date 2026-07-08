import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { cn } from "@/theme/utils.ts";
import {
	UiDropdownMenu,
	UiDropdownMenuContent,
	UiDropdownMenuRadioGroup,
	UiDropdownMenuRadioItem,
	UiDropdownMenuTrigger,
} from "@/ui/UiDropdownMenu";

import type { SendableAsset } from "../model";

function AssetGlyph({ symbol }: { symbol: string }) {
	return (
		<span className="bg-muted flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
			{symbol.charAt(0)}
		</span>
	);
}

/**
 * Asset picker for the Send form. With a single sendable asset (the common L-BTC-only case) it
 * renders a static row; with more than one it becomes a dropdown over the account's held assets.
 */
export function AssetSelector({
	assets,
	onSelect,
	selected,
}: {
	assets: SendableAsset[];
	onSelect: (rawAssetId: string) => void;
	selected: SendableAsset | null;
}) {
	if (assets.length <= 1) {
		return (
			<div className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
				<AssetGlyph symbol={selected?.symbol ?? "?"} />
				<span className="font-medium">{selected?.symbol ?? "—"}</span>
				{selected ? (
					<span className="text-muted-foreground truncate text-xs">{selected.name}</span>
				) : null}
			</div>
		);
	}

	return (
		<UiDropdownMenu>
			<UiDropdownMenuTrigger
				className={cn(
					"flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
					"hover:bg-accent aria-expanded:bg-accent",
				)}
			>
				<span className="flex min-w-0 items-center gap-2">
					<AssetGlyph symbol={selected?.symbol ?? "?"} />
					<span className="font-medium">{selected?.symbol ?? "Select asset"}</span>
				</span>
				<HugeiconsIcon icon={ArrowDown01Icon} size={16} className="text-muted-foreground" />
			</UiDropdownMenuTrigger>
			<UiDropdownMenuContent align="start" className="min-w-56">
				<UiDropdownMenuRadioGroup value={selected?.rawAssetId} onValueChange={onSelect}>
					{assets.map((asset) => (
						<UiDropdownMenuRadioItem
							key={asset.rawAssetId}
							closeOnClick
							value={asset.rawAssetId}
							className="gap-2"
						>
							<AssetGlyph symbol={asset.symbol} />
							<span className="font-medium">{asset.symbol}</span>
							<span className="text-muted-foreground truncate text-xs">{asset.name}</span>
						</UiDropdownMenuRadioItem>
					))}
				</UiDropdownMenuRadioGroup>
			</UiDropdownMenuContent>
		</UiDropdownMenu>
	);
}
