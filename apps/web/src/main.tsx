import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./index.css";
import { ThemeProvider } from "@/components/theme-provider.tsx";
import { Web3Provider } from "@/contexts/Web3Provider";

import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
	<Web3Provider>
		<StrictMode>
			<ThemeProvider>
				<App />
			</ThemeProvider>
		</StrictMode>
	</Web3Provider>,
);
