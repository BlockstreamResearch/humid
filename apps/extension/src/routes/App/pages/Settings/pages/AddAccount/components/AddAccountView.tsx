import { type FormEvent, useState } from "react";

import { Page } from "@/common/Page";
import { cn } from "@/theme/utils.ts";
import { UiButton } from "@/ui/UiButton/base";
import { UiInput } from "@/ui/UiInput/base";
import { UiTextarea } from "@/ui/UiTextarea/base";

type Mode = "create" | "import";

type AddAccountViewProps = {
	accountTypeLabel: string;
	error: string | null;
	isSubmitting: boolean;
	onCreate: (input: { name?: string }) => void;
	onImport: (input: { mnemonic: string; name?: string }) => void;
};

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
		<Page back={{ label: "Back to settings", to: "/app/settings" }} title="Add account">
			<form className="flex flex-col gap-4 px-5 py-4" onSubmit={handleSubmit}>
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
							placeholder="Enter the 12-word recovery phrase"
							rows={3}
							value={mnemonic}
						/>
						<span className="text-muted-foreground text-xs">
							Adds an account from a different recovery phrase.
						</span>
					</div>
				) : (
					<p className="text-muted-foreground text-sm leading-6">
						Creates the next account from this wallet&apos;s recovery phrase.
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
		</Page>
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
