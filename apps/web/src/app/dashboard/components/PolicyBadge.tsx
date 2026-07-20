import { Badge } from "@/components/ui/badge";

import type { MethodState } from "../lib/method-state";

const METHOD_STATE_META: Record<MethodState, { className: string; label: string }> = {
	silent: {
		className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
		label: "silent",
	},
	"needs-approval": {
		className: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
		label: "needs approval",
	},
	unsupported: {
		className: "text-muted-foreground",
		label: "unsupported",
	},
};

export function PolicyBadge({ state }: { state: MethodState }) {
	const meta = METHOD_STATE_META[state];
	return (
		<Badge variant="outline" className={meta.className}>
			{meta.label}
		</Badge>
	);
}

export function PolicyLegend() {
	return (
		<div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
			<span className="flex items-center gap-1.5">
				<PolicyBadge state="silent" /> runs without a prompt
			</span>
			<span className="flex items-center gap-1.5">
				<PolicyBadge state="needs-approval" /> prompts on every call
			</span>
			<span className="flex items-center gap-1.5">
				<PolicyBadge state="unsupported" /> not in this session
			</span>
		</div>
	);
}
