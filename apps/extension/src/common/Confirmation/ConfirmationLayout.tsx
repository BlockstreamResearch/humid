import type { ReactNode } from "react";

import { UiButton } from "@/ui/UiButton/base";

import { DappProvided } from "./ConfirmationParts";

type Props = {
	origin?: string;
	account?: string;
	network?: string;
	title: string;
	statement?: ReactNode;
	statementByDapp?: string;
	children?: ReactNode;
	footer: ReactNode;
};

export function ConfirmationLayout({
	origin,
	account,
	network,
	title,
	statement,
	statementByDapp,
	children,
	footer,
}: Props) {
	const host = origin === undefined ? undefined : hostOf(origin);

	return (
		<div className="bg-background text-foreground flex size-full flex-col">
			<header className="flex flex-col gap-3 px-4 pt-4 pb-3">
				{(host !== undefined || account !== undefined || network !== undefined) && (
					<div className="flex items-center gap-2">
						{host !== undefined && (
							<>
								<span
									aria-hidden="true"
									className="bg-muted border-border flex size-6 items-center justify-center rounded-md border text-xs font-semibold uppercase"
								>
									{host.charAt(0)}
								</span>
								<span className="text-muted-foreground min-w-0 flex-1 truncate text-[13px]">
									{host}
								</span>
							</>
						)}
						{host === undefined && account !== undefined && (
							<span className="text-muted-foreground min-w-0 flex-1 truncate text-[13px]">
								{account}
							</span>
						)}
						{network !== undefined && (
							<span className="bg-muted text-muted-foreground ml-auto rounded-full px-2 py-0.5 text-xs">
								{network}
							</span>
						)}
					</div>
				)}
				<div className="flex flex-col gap-1">
					<h1 className="text-xl leading-7 font-bold">{title}</h1>
					{statement !== undefined && (
						<p className="text-foreground/80 text-sm leading-5">{statement}</p>
					)}
					{statementByDapp !== undefined && <DappProvided>{statementByDapp}</DappProvided>}
				</div>
			</header>
			<main className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pt-1 pb-4">
				{children}
			</main>
			<footer className="border-border flex flex-col gap-2.5 border-t px-4 pt-3 pb-4">
				{footer}
			</footer>
		</div>
	);
}

export function ConfirmationActions({
	signer,
	rejectLabel = "Reject",
	confirmLabel,
	onReject,
	onConfirm,
	canConfirm = true,
	busy = false,
}: {
	signer?: string;
	rejectLabel?: string;
	confirmLabel: string;
	onReject: () => void;
	onConfirm: () => void;
	canConfirm?: boolean;
	busy?: boolean;
}) {
	return (
		<>
			{signer !== undefined && (
				<span className="text-muted-foreground text-center text-xs">{signer}</span>
			)}
			<div className="grid grid-cols-2 gap-2">
				<UiButton
					type="button"
					variant="outline"
					className="h-11"
					disabled={busy}
					onClick={onReject}
				>
					{rejectLabel}
				</UiButton>
				<UiButton type="button" className="h-11" disabled={busy || !canConfirm} onClick={onConfirm}>
					{confirmLabel}
				</UiButton>
			</div>
		</>
	);
}

export function hostOf(origin: string): string {
	try {
		return new URL(origin).host || origin;
	} catch {
		return origin;
	}
}
