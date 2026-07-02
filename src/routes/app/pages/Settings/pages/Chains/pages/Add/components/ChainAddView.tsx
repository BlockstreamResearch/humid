import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { UiButton } from "@/ui/UiButton/base";
import { UiInput } from "@/ui/UiInput/base";
import { UiScrollArea } from "@/ui/UiScrollArea";

type ChainAddViewProps = {
	chainTypeLabel: string;
	children: ReactNode;
	error: string | null;
	isSubmitting: boolean;
	name: string;
	onNameChange: (name: string) => void;
	onSubmit: () => void;
};

/**
 * Add chain: name + the chain group's own settings, then submit. The chain group is
 * auto-selected while only one exists (see TODO).
 */
export function ChainAddView({
	chainTypeLabel,
	children,
	error,
	isSubmitting,
	name,
	onNameChange,
	onSubmit,
}: ChainAddViewProps) {
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
				<h1 className="text-base font-semibold">Add chain</h1>
			</header>
			<UiScrollArea className="min-h-0 flex-1">
				<div className="flex flex-col gap-4 px-5 py-4">
					{/* TODO: only one chain group exists, so it is auto-selected. Replace this
					    static row with a real picker once more chain groups are registered. */}
					<div className="flex items-center justify-between rounded-lg border px-3 py-2">
						<span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
							Chain type
						</span>
						<span className="text-sm font-medium">{chainTypeLabel}</span>
					</div>

					<div className="flex flex-col gap-1.5">
						<label className="text-sm font-medium" htmlFor="add-chain-name">
							Name
						</label>
						<UiInput
							id="add-chain-name"
							maxLength={40}
							onChange={(event) => onNameChange(event.target.value)}
							placeholder="Chain name"
							value={name}
						/>
					</div>

					{children}

					{error ? <p className="text-destructive text-sm">{error}</p> : null}
				</div>
			</UiScrollArea>
			<div className="border-border/60 shrink-0 border-t p-3">
				<UiButton
					className="w-full"
					disabled={isSubmitting || name.trim().length === 0}
					onClick={onSubmit}
					size="lg"
					type="button"
				>
					{isSubmitting ? "Adding…" : "Add chain"}
				</UiButton>
			</div>
		</div>
	);
}
