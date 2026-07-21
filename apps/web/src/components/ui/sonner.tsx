import type { CSSProperties } from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

import { useTheme } from "@/components/theme-provider";

/** App-wide toast host, themed from the shadcn tokens and the active light/dark theme. */
function Toaster({ ...props }: ToasterProps) {
	const { theme } = useTheme();

	return (
		<Sonner
			theme={theme}
			className="toaster group"
			position="bottom-center"
			style={
				{
					"--normal-bg": "var(--popover)",
					"--normal-text": "var(--popover-foreground)",
					"--normal-border": "var(--border)",
				} as CSSProperties
			}
			{...props}
		/>
	);
}

export { Toaster };
