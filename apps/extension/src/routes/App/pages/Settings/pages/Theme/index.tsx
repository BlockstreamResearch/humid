import { useTheme } from "@/contexts/ThemeProvider";

import { ThemeView } from "./components/ThemeView";

export function SettingsThemePage() {
	const { setTheme, systemTheme, theme } = useTheme();

	return <ThemeView onThemeChange={setTheme} systemTheme={systemTheme} theme={theme} />;
}
