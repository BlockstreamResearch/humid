import { UiScrollArea } from "@/ui/UiScrollArea";

/** Settings tab — its own header (not the account header) over a scrolling body. */
export function AppSettingsPage() {
	return (
		<div className="flex size-full min-h-0 flex-col">
			<header className="border-border/60 flex shrink-0 items-center border-b px-4 py-3">
				<h1 className="text-base font-semibold">Settings</h1>
			</header>
			<UiScrollArea className="min-h-0 flex-1">
				<p className="text-muted-foreground px-5 py-10 text-center text-sm">
					Settings coming soon.
				</p>
			</UiScrollArea>
		</div>
	);
}
