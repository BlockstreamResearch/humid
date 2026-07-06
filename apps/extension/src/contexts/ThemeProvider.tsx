import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type Theme = "dark" | "light" | "system";
type ResolvedTheme = Exclude<Theme, "system">;

type ThemeProviderProps = {
	children: React.ReactNode;
	defaultTheme?: Theme;
	storageKey?: string;
};

type ThemeProviderState = {
	theme: Theme;
	systemTheme: ResolvedTheme;
	setTheme: (theme: Theme) => void;
};

const initialState: ThemeProviderState = {
	theme: "system",
	systemTheme: "light",
	setTheme: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

function getSystemTheme(): ResolvedTheme {
	return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeProvider({
	children,
	defaultTheme = "system",
	storageKey = "ui-theme",
	...props
}: ThemeProviderProps) {
	const [theme, setTheme] = useState<Theme>(
		() => (localStorage.getItem(storageKey) as Theme) || defaultTheme,
	);
	const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => getSystemTheme());

	useEffect(() => {
		const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
		const handleSystemThemeChange = (event: MediaQueryListEvent) => {
			setSystemTheme(event.matches ? "dark" : "light");
		};

		setSystemTheme(mediaQuery.matches ? "dark" : "light");
		mediaQuery.addEventListener("change", handleSystemThemeChange);

		return () => mediaQuery.removeEventListener("change", handleSystemThemeChange);
	}, []);

	useEffect(() => {
		const root = window.document.documentElement;

		root.classList.remove("light", "dark");

		if (theme === "system") {
			root.classList.add(systemTheme);
			return;
		}

		root.classList.add(theme);
	}, [systemTheme, theme]);

	const updateTheme = useCallback(
		(nextTheme: Theme) => {
			localStorage.setItem(storageKey, nextTheme);
			setTheme(nextTheme);
		},
		[storageKey],
	);

	const value = useMemo(
		() => ({
			theme,
			systemTheme,
			setTheme: updateTheme,
		}),
		[systemTheme, theme, updateTheme],
	);

	return (
		<ThemeProviderContext.Provider {...props} value={value}>
			{children}
		</ThemeProviderContext.Provider>
	);
}

export const useTheme = () => {
	const context = useContext(ThemeProviderContext);

	if (context === undefined) throw new Error("useTheme must be used within a ThemeProvider");

	return context;
};
