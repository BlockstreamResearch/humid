import { ArrowDownLeft01Icon, ArrowUpRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";

import { cn } from "@/theme/utils.ts";
import { UiButton, UiButtonVariants } from "@/ui/UiButton/base";

/** Primary money actions. Receive opens the receive screen; Send is wired later. */
export function QuickActions() {
	return (
		<div className="flex gap-2">
			<Link
				to="/app/receive"
				className={cn(UiButtonVariants({ size: "lg", variant: "outline" }), "flex-1")}
			>
				<HugeiconsIcon icon={ArrowDownLeft01Icon} size={18} />
				Receive
			</Link>
			<UiButton type="button" variant="outline" size="lg" className="flex-1">
				<HugeiconsIcon icon={ArrowUpRight01Icon} size={18} />
				Send
			</UiButton>
		</div>
	);
}
