import { createContext, useContext, useEffect, useMemo, useState } from "react";

type Theme = "dark" | "light" | "system";

type ThemeProviderProps = {
	children: React.ReactNode;
	defaultTheme?: Theme;
	storageKey?: string;
};

type ThemeProviderState = {
	theme: Theme;
	systemTheme: Omit<Theme, "system">;
	setTheme: (theme: Theme) => void;
};

const initialState: ThemeProviderState = {
	theme: "system",
	systemTheme: "light",
	setTheme: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

export function ThemeProvider({
	children,
	defaultTheme = "system",
	storageKey = "ui-theme",
	...props
}: ThemeProviderProps) {
	const [theme, setTheme] = useState<Theme>(
		() => (localStorage.getItem(storageKey) as Theme) || defaultTheme,
	);

	const systemTheme = useMemo(
		() => (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"),
		[],
	);

	useEffect(() => {
		const root = window.document.documentElement;

		root.classList.remove("light", "dark");

		if (theme === "system") {
			root.classList.add(systemTheme);
			return;
		}

		root.classList.add(theme);
	}, [systemTheme, theme]);

	return (
		<ThemeProviderContext.Provider
			{...props}
			value={{
				theme,
				systemTheme,
				setTheme: (theme: Theme) => {
					localStorage.setItem(storageKey, theme);
					setTheme(theme);
				},
			}}
		>
			{children}
		</ThemeProviderContext.Provider>
	);
}

export const useTheme = () => {
	const context = useContext(ThemeProviderContext);

	if (context === undefined) throw new Error("useTheme must be used within a ThemeProvider");

	return context;
};
