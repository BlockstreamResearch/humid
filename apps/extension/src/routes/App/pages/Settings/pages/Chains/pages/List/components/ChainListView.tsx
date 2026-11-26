import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";

import { Page } from "@/common/Page";
import type { ChainRecord } from "@/core/chains/application/ChainRecord";

type ChainGroupView = {
	chains: ChainRecord[];
	id: string;
	name: string;
};

export function ChainListView({ groups }: { groups: ChainGroupView[] }) {
	return (
		<Page back={{ label: "Back to settings", to: "/app/settings" }} title="Networks">
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
								Add network
							</Link>
						</div>
					</section>
				))}
			</div>
		</Page>
	);
}
