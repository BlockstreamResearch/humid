import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { UiButton } from "@/ui/UiButton/base";
import { UiScrollArea } from "@/ui/UiScrollArea";

type ChainItemViewProps = {
	children: ReactNode;
	chainName: string;
	isRemoving?: boolean;
	isSaving: boolean;
	onRemove?: () => void;
	onSave: () => void;
};

/**
 * Per-chain settings shell: header + Save footer around the chain-provided settings
 * (`children`), plus a Remove action for custom (removable) chains.
 */
export function ChainItemView({
	children,
	chainName,
	isRemoving,
	isSaving,
	onRemove,
	onSave,
}: ChainItemViewProps) {
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
				<div className="flex flex-col gap-6 px-5 py-4">
					{children}
					{onRemove ? (
						<UiButton
							className="w-full"
							disabled={isRemoving}
							onClick={onRemove}
							type="button"
							variant="destructive"
						>
							{isRemoving ? "Removing…" : "Remove chain"}
						</UiButton>
					) : null}
				</div>
			</UiScrollArea>
			<div className="border-border/60 shrink-0 border-t p-3">
				<UiButton className="w-full" disabled={isSaving} onClick={onSave} size="lg" type="button">
					{isSaving ? "Saving…" : "Save"}
				</UiButton>
			</div>
		</div>
	);
}
