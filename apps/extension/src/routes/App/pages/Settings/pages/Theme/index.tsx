import { useTheme } from "@/contexts/ThemeProvider";

import { ThemeView } from "./components/ThemeView";

/** Theme settings (container): wires the persisted theme provider to the settings screen. */
export function SettingsThemePage() {
	const { setTheme, systemTheme, theme } = useTheme();

	return <ThemeView onThemeChange={setTheme} systemTheme={systemTheme} theme={theme} />;
}
