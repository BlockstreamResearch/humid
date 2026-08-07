import { ChevronLeftIcon } from "lucide-react";
import { useState } from "react";

import Dashboard from "@/app/dashboard";
import Home from "@/app/home";
import ManifestInspector from "@/app/manifest";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

type View = "developer" | "home" | "manifest";

export function App() {
	const [view, setView] = useState<View>("home");

	return (
		<TooltipProvider>
			{(() => {
				if (view === "home") {
					return (
						<Home
							onOpenDeveloper={() => setView("developer")}
							onOpenManifestInspector={() => setView("manifest")}
						/>
					);
				}

				return (
					<div className="flex min-h-svh flex-col">
						<div className="mx-auto flex w-full max-w-4xl px-4 pt-4">
							<Button variant="ghost" size="sm" onClick={() => setView("home")}>
								<ChevronLeftIcon />
								Back to app
							</Button>
						</div>
						{view === "developer" ? <Dashboard /> : <ManifestInspector />}
					</div>
				);
			})()}
			<Toaster />
		</TooltipProvider>
	);
}

export default App;
