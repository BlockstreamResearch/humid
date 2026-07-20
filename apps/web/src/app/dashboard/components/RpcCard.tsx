import type { ReactNode } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import type { MethodState } from "../lib/method-state";
import { PolicyBadge } from "./PolicyBadge";

export function RpcCard({
	children,
	description,
	policy,
	title,
}: {
	children: ReactNode;
	description: string;
	policy?: MethodState;
	title: string;
}) {
	return (
		<Card>
			<CardHeader>
				<div className="flex items-center justify-between gap-2">
					<CardTitle className="font-mono text-base">{title}</CardTitle>
					{policy !== undefined && <PolicyBadge state={policy} />}
				</div>
				<CardDescription>{description}</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-3">{children}</CardContent>
		</Card>
	);
}
