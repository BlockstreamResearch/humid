import { UiSpinner } from "@/ui/UiSpinner";

export function PreparingConfirmation() {
	return (
		<div className="bg-background text-muted-foreground flex size-full flex-col items-center justify-center gap-3">
			<UiSpinner className="size-6" />
			<p className="text-sm">Preparing the request…</p>
		</div>
	);
}
