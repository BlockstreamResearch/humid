import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";

import { cn } from "@/theme/utils.ts";
import { UiButton } from "@/ui/UiButton/base";
import { UiInput } from "@/ui/UiInput/base";
import { UiScrollArea } from "@/ui/UiScrollArea";
import { UiTextarea } from "@/ui/UiTextarea/base";

type Mode = "create" | "import";

type AddAccountViewProps = {
	accountTypeLabel: string;
	error: string | null;
	isSubmitting: boolean;
	onCreate: (input: { name?: string }) => void;
	onImport: (input: { mnemonic: string; name?: string }) => void;
};

/**
 * Add account: pick create (derive on the current seed) or import (a new recovery
 * phrase). The chain account type is auto-selected while only one exists (see TODO).
 */
export function AddAccountView({
	accountTypeLabel,
	error,
	isSubmitting,
	onCreate,
	onImport,
}: AddAccountViewProps) {
	const [mode, setMode] = useState<Mode>("create");
	const [name, setName] = useState("");
	const [mnemonic, setMnemonic] = useState("");

	const trimmedName = name.trim();
	const trimmedMnemonic = mnemonic.trim();

	const handleSubmit = (event: FormEvent) => {
		event.preventDefault();

		if (isSubmitting) return;

		const namePayload = trimmedName ? trimmedName : undefined;

		if (mode === "create") {
			onCreate({ name: namePayload });
			return;
		}

		if (!trimmedMnemonic) return;

		onImport({ mnemonic: trimmedMnemonic, name: namePayload });
	};

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
				<h1 className="text-base font-semibold">Add account</h1>
			</header>

			<UiScrollArea className="min-h-0 flex-1">
				<form className="flex flex-col gap-4 px-5 py-4" onSubmit={handleSubmit}>
					{/* TODO: only one chain account type exists, so it is auto-selected. Replace
					    this static row with a real picker once more account types are registered. */}
					<div className="flex items-center justify-between rounded-lg border px-3 py-2">
						<span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
							Account type
						</span>
						<span className="text-sm font-medium">{accountTypeLabel}</span>
					</div>

					<div className="bg-muted flex gap-1 rounded-lg p-1">
						<ModeTab active={mode === "create"} label="Create" onClick={() => setMode("create")} />
						<ModeTab active={mode === "import"} label="Import" onClick={() => setMode("import")} />
					</div>

					<div className="flex flex-col gap-1.5">
						<label className="text-sm font-medium" htmlFor="add-account-name">
							Name <span className="text-muted-foreground font-normal">(optional)</span>
						</label>
						<UiInput
							id="add-account-name"
							maxLength={40}
							onChange={(event) => setName(event.target.value)}
							placeholder={mode === "create" ? "Account name" : "Imported account"}
							value={name}
						/>
					</div>

					{mode === "import" ? (
						<div className="flex flex-col gap-1.5">
							<label className="text-sm font-medium" htmlFor="add-account-mnemonic">
								Recovery phrase
							</label>
							<UiTextarea
								className="font-mono"
								id="add-account-mnemonic"
								onChange={(event) => setMnemonic(event.target.value)}
								placeholder="Enter your 12 or 24 word recovery phrase"
								rows={3}
								value={mnemonic}
							/>
							<span className="text-muted-foreground text-xs">
								The imported account is stored in this wallet.
							</span>
						</div>
					) : (
						<p className="text-muted-foreground text-sm leading-6">
							Creates the next account on your current wallet&apos;s recovery phrase.
						</p>
					)}

					{error ? <p className="text-destructive text-sm">{error}</p> : null}

					<UiButton
						disabled={isSubmitting || (mode === "import" && !trimmedMnemonic)}
						size="lg"
						type="submit"
					>
						{isSubmitting ? "Working…" : mode === "create" ? "Create account" : "Import account"}
					</UiButton>
				</form>
			</UiScrollArea>
		</div>
	);
}

function ModeTab({
	active,
	label,
	onClick,
}: {
	active: boolean;
	label: string;
	onClick: () => void;
}) {
	return (
		<button
			className={cn(
				"flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
				active ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
			)}
			onClick={onClick}
			type="button"
		>
			{label}
		</button>
	);
}
