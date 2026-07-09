import { CheckmarkCircle02Icon, Copy01Icon, LinkSquare02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";

import { cn } from "@/theme/utils.ts";
import { UiButtonVariants } from "@/ui/UiButton/base";
import { UiCopyButton } from "@/ui/UiCopyButton";

/**
 * Step 3 of the Send flow: the broadcast succeeded. Shows the txid (copyable) and, when the chain
 * exposes an explorer URL, a "view on explorer" link. "Done" returns to the home overview.
 */
export function SendResult({ explorerUrl, txid }: { explorerUrl: string | null; txid: string }) {
	return (
		<div className="flex size-full min-h-0 flex-col">
			<header className="border-border/60 flex shrink-0 items-center gap-2 border-b px-2 py-2.5">
				<p className="text-sm font-semibold">Transaction sent</p>
			</header>

			<div className="flex flex-1 flex-col items-center gap-5 px-5 py-8 text-center">
				<span className="bg-primary/10 text-primary flex size-14 items-center justify-center rounded-full">
					<HugeiconsIcon icon={CheckmarkCircle02Icon} size={32} />
				</span>

				<div className="flex flex-col gap-1">
					<p className="text-base font-semibold">Transfer broadcast</p>
					<p className="text-muted-foreground text-sm">
						Your transaction was submitted to the Liquid network.
					</p>
				</div>

				<div className="flex w-full flex-col gap-1.5 text-left">
					<span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
						Transaction ID
					</span>
					<UiCopyButton
						className="hover:bg-accent flex items-start gap-2 rounded-lg border px-3 py-2 text-left transition-colors"
						value={txid}
					>
						{(copied) => (
							<>
								<span className="min-w-0 flex-1 font-mono text-xs break-all">{txid}</span>
								<HugeiconsIcon
									className="text-muted-foreground mt-0.5 shrink-0"
									icon={copied ? CheckmarkCircle02Icon : Copy01Icon}
									size={16}
								/>
							</>
						)}
					</UiCopyButton>
				</div>

				<div className="mt-auto flex w-full flex-col gap-2">
					{explorerUrl ? (
						<a
							className={cn(UiButtonVariants({ size: "lg", variant: "outline" }), "w-full")}
							href={explorerUrl}
							rel="noreferrer"
							target="_blank"
						>
							<HugeiconsIcon icon={LinkSquare02Icon} size={18} />
							View on explorer
						</a>
					) : null}
					<Link className={cn(UiButtonVariants({ size: "lg" }), "w-full")} to="/app">
						Done
					</Link>
				</div>
			</div>
		</div>
	);
}
