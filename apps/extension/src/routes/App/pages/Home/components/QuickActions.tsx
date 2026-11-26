import {
	Activity01Icon,
	ArrowDownLeft01Icon,
	ArrowUpRight01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";

import { cn } from "@/theme/utils.ts";
import { UiButtonVariants } from "@/ui/UiButton/base";

/** `waiting` adds the Activity action, badged with how many transactions are still pending. */
export function QuickActions({ assetId, waiting }: { assetId?: string; waiting?: number }) {
	return (
		<div className="flex gap-2">
			<Link
				to="/app/receive"
				className={cn(UiButtonVariants({ size: "lg", variant: "outline" }), "flex-1")}
			>
				<HugeiconsIcon icon={ArrowDownLeft01Icon} size={18} />
				Receive
			</Link>
			<Link
				to="/app/send"
				search={assetId ? { asset: assetId } : undefined}
				className={cn(UiButtonVariants({ size: "lg", variant: "outline" }), "flex-1")}
			>
				<HugeiconsIcon icon={ArrowUpRight01Icon} size={18} />
				Send
			</Link>
			{waiting === undefined ? null : (
				<Link
					to="/app/activity"
					className={cn(UiButtonVariants({ size: "lg", variant: "outline" }), "relative flex-1")}
				>
					<HugeiconsIcon icon={Activity01Icon} size={18} />
					Activity
					{waiting > 0 ? (
						<span
							aria-label={`${waiting} pending`}
							className="bg-primary text-primary-foreground absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full text-[0.65rem] font-semibold"
						>
							{waiting}
						</span>
					) : null}
				</Link>
			)}
		</div>
	);
}
