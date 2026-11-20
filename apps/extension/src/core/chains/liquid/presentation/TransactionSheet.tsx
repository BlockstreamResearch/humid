import { CheckmarkCircle02Icon, Copy01Icon, LinkSquare02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { type ReactNode, useRef } from "react";

import { cn } from "@/theme/utils.ts";
import { UiButtonVariants } from "@/ui/UiButton/base";
import { UiCopyButton } from "@/ui/UiCopyButton";
import { UiDrawer, UiDrawerContent, UiDrawerHeader, UiDrawerTitle } from "@/ui/UiDrawer";

export type TransactionSheetContent = {
	actions?: ReactNode;
	copies: { label: string; note?: string; value: string }[];
	explorerUrl: string | null;
	headline: string;
	icon: IconSvgElement;
	rows: { label: string; value: ReactNode }[];
	status: ReactNode;
};

export function TransactionSheet({
	content,
	onClose,
}: {
	content: TransactionSheetContent | null;
	onClose: () => void;
}) {
	// Keeps the last content on screen while the drawer animates closed.
	const shown = useRef(content);

	if (content) shown.current = content;

	const active = content ?? shown.current;

	return (
		<UiDrawer
			open={content !== null}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<UiDrawerContent className="max-h-[85vh]">
				<UiDrawerHeader className="pt-3 pb-2">
					<UiDrawerTitle className="flex items-center justify-center gap-2">
						{active ? (
							<span className="bg-muted text-muted-foreground flex size-7 items-center justify-center rounded-full">
								<HugeiconsIcon icon={active.icon} size={14} />
							</span>
						) : null}
						Transaction
					</UiDrawerTitle>
				</UiDrawerHeader>

				{active ? (
					<div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-4 pb-6">
						<div className="flex flex-col items-center gap-2 pb-1 text-center">
							<p className="font-mono text-xl font-semibold tracking-tight">{active.headline}</p>
							{active.status}
						</div>

						<dl className="divide-border/60 flex flex-col divide-y rounded-xl border">
							{active.rows.map(({ label, value }, at) => (
								<div
									className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
									// oxlint-disable-next-line react/no-array-index-key -- labels repeat, as with two assets received
									key={`${label}:${at}`}
								>
									<dt className="text-muted-foreground shrink-0">{label}</dt>
									<dd className="min-w-0 truncate text-right font-medium">{value}</dd>
								</div>
							))}
						</dl>

						{active.copies.map((copy) => (
							<CopyBlock key={`${copy.label}:${copy.value}`} {...copy} />
						))}

						{active.actions}

						{active.explorerUrl ? (
							<a
								className={cn(UiButtonVariants({ size: "lg", variant: "outline" }), "w-full")}
								href={active.explorerUrl}
								rel="noreferrer"
								target="_blank"
							>
								<HugeiconsIcon icon={LinkSquare02Icon} size={18} />
								View on explorer
							</a>
						) : null}
					</div>
				) : null}
			</UiDrawerContent>
		</UiDrawer>
	);
}

function CopyBlock({ label, note, value }: { label: string; note?: string; value: string }) {
	return (
		<div className="flex flex-col gap-1.5">
			<span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
				{label}
			</span>
			<UiCopyButton
				className="hover:bg-accent flex items-start gap-2 rounded-lg border px-3 py-2 text-left transition-colors"
				value={value}
			>
				{(copied) => (
					<>
						<span className="min-w-0 flex-1 font-mono text-xs break-all">{value}</span>
						<HugeiconsIcon
							className="text-muted-foreground mt-0.5 shrink-0"
							icon={copied ? CheckmarkCircle02Icon : Copy01Icon}
							size={16}
						/>
					</>
				)}
			</UiCopyButton>
			{note ? <p className="text-muted-foreground text-xs">{note}</p> : null}
		</div>
	);
}
