import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { UiButton } from "@/ui/UiButton/base";
import { UiScrollArea } from "@/ui/UiScrollArea";

type ChainItemViewProps = {
	children: ReactNode;
	chainName: string;
	isSaving: boolean;
	onSave: () => void;
};

/**
 * Per-chain settings shell: header + Save footer around the chain-provided settings
 * (`children`). The chain group implements the settings body; this only frames it.
 */
export function ChainItemView({ children, chainName, isSaving, onSave }: ChainItemViewProps) {
	return (
		<div className="flex size-full min-h-0 flex-col">
			<header className="border-border/60 flex shrink-0 items-center gap-2 border-b px-3 py-3">
				<Link
					aria-label="Back to chains"
					className="text-muted-foreground hover:text-foreground shrink-0"
					to="/app/settings/chains"
				>
					<HugeiconsIcon icon={ArrowLeft01Icon} size={18} />
				</Link>
				<h1 className="truncate text-base font-semibold">{chainName}</h1>
			</header>
			<UiScrollArea className="min-h-0 flex-1">
				<div className="px-5 py-4">{children}</div>
			</UiScrollArea>
			<div className="border-border/60 shrink-0 border-t p-3">
				<UiButton className="w-full" disabled={isSaving} onClick={onSave} size="lg" type="button">
					{isSaving ? "Saving…" : "Save"}
				</UiButton>
			</div>
		</div>
	);
}
