import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";

import type { ChainRecord } from "@/core/chains/application/ChainRecord";
import { UiScrollArea } from "@/ui/UiScrollArea";

type ChainGroupView = {
	chains: ChainRecord[];
	id: string;
	name: string;
};

/**
 * Chains list: chain groups with their chains; each chain opens its settings, and each
 * group has its own "Add chain" (a chain is added within — and by — its chain group).
 */
export function ChainListView({ groups }: { groups: ChainGroupView[] }) {
	return (
		<div className="flex size-full min-h-0 flex-col">
			<header className="border-border/60 flex shrink-0 items-center gap-2 border-b px-3 py-3">
				<Link
					aria-label="Back to settings"
					className="text-muted-foreground hover:text-foreground"
					to="/app/settings"
				>
					<HugeiconsIcon icon={ArrowLeft01Icon} size={18} />
				</Link>
				<h1 className="text-base font-semibold">Chains</h1>
			</header>
			<UiScrollArea className="min-h-0 flex-1">
				<div className="flex flex-col gap-4 px-3 py-4">
					{groups.map((group) => (
						<section key={group.id} className="flex flex-col gap-1">
							<p className="text-muted-foreground px-2 text-xs font-medium tracking-wide uppercase">
								{group.name}
							</p>
							<div className="flex flex-col">
								{group.chains.map((chain) => (
									<Link
										key={chain.id}
										className="hover:bg-accent flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors"
										params={{ chainId: chain.id }}
										to="/app/settings/chains/$chainId"
									>
										<span className="flex-1 truncate text-sm font-medium">{chain.name}</span>
										<HugeiconsIcon
											className="text-muted-foreground/60 shrink-0"
											icon={ArrowRight01Icon}
											size={16}
										/>
									</Link>
								))}
								<Link
									className="hover:bg-accent text-primary flex items-center gap-2 rounded-lg px-2 py-2.5 text-sm font-medium transition-colors"
									search={{ group: group.id }}
									to="/app/settings/chains/add"
								>
									<span aria-hidden className="text-base leading-none">
										+
									</span>
									Add chain
								</Link>
							</div>
						</section>
					))}
				</div>
			</UiScrollArea>
		</div>
	);
}
