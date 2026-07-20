import { ArrowUpRightIcon, FingerprintIcon, PenLineIcon, type LucideIcon } from "lucide-react";
import { Fragment, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";

import { ProveIdentityDialog } from "./ProveIdentityDialog";
import { SignMessageDialog } from "./SignMessageDialog";
import { TransferSheet } from "./TransferSheet";

type OverlayProps = { open: boolean; onOpenChange: (open: boolean) => void };

type HomeAction = {
	id: string;
	label: string;
	icon: LucideIcon;
	render: (props: OverlayProps) => ReactNode;
};

// Extensible action set: add read actions (View coins / Addresses) here in a later phase.
const actions: HomeAction[] = [
	{
		id: "transfer",
		label: "Transfer",
		icon: ArrowUpRightIcon,
		render: (props) => <TransferSheet {...props} />,
	},
	{
		id: "sign",
		label: "Sign message",
		icon: PenLineIcon,
		render: (props) => <SignMessageDialog {...props} />,
	},
	{
		id: "prove",
		label: "Prove identity",
		icon: FingerprintIcon,
		render: (props) => <ProveIdentityDialog {...props} />,
	},
];

/** The row of primary actions under the hero; each opens its overlay (Sheet or Dialog). */
export function HomeActions() {
	const [openId, setOpenId] = useState<string | null>(null);

	return (
		<>
			<div className="grid grid-cols-3 gap-2">
				{actions.map((action) => (
					<Button
						key={action.id}
						variant="outline"
						className="h-auto flex-col gap-2 py-4"
						onClick={() => setOpenId(action.id)}
					>
						<action.icon className="text-muted-foreground size-5" />
						<span className="text-xs font-medium">{action.label}</span>
					</Button>
				))}
			</div>

			{actions.map((action) => (
				<Fragment key={action.id}>
					{action.render({
						open: openId === action.id,
						onOpenChange: (open) => setOpenId(open ? action.id : null),
					})}
				</Fragment>
			))}
		</>
	);
}
