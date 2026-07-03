import Dashboard from "@/app/dashboard";
import { TooltipProvider } from "@/components/ui/tooltip";

export function App() {
	return (
		<TooltipProvider>
			<Dashboard />
		</TooltipProvider>
	);
}

export default App;
