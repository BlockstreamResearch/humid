import { ArrowLeft01Icon, ComputerIcon, Moon02Icon, Sun03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import type { ComponentProps } from "react";

import type { Theme } from "@/contexts/ThemeProvider";
import { cn } from "@/theme/utils.ts";
import { UiRadioGroup, UiRadioGroupItem } from "@/ui/UiRadioGroup";
import { UiScrollArea } from "@/ui/UiScrollArea";

type Icon = ComponentProps<typeof HugeiconsIcon>["icon"];

type ThemeOption = {
	description: string;
	icon: Icon;
	label: string;
	value: Theme;
};

const THEME_OPTIONS: ThemeOption[] = [
	{
		description: "Always use the light appearance.",
		icon: Sun03Icon,
		label: "Light",
		value: "light",
	},
	{
		description: "Always use the dark appearance.",
		icon: Moon02Icon,
		label: "Dark",
		value: "dark",
	},
	{
		description: "Follow the appearance selected on this device.",
		icon: ComputerIcon,
		label: "System",
		value: "system",
	},
];

type ThemeViewProps = {
	onThemeChange: (theme: Theme) => void;
	systemTheme: Exclude<Theme, "system">;
	theme: Theme;
};

/** Theme picker: lets the user select light, dark, or the current system appearance. */
export function ThemeView({ onThemeChange, systemTheme, theme }: ThemeViewProps) {
	return (
		<div className="flex size-full min-h-0 flex-col">
			<header className="border-border/60 flex shrink-0 items-center gap-2 border-b px-3 py-3">
				<Link
					aria-label="Back to settings"
					className="text-muted-foreground hover:text-foreground shrink-0"
					to="/app/settings"
				>
					<HugeiconsIcon icon={ArrowLeft01Icon} size={18} />
				</Link>
				<h1 className="text-base font-semibold">Theme</h1>
			</header>
			<UiScrollArea className="min-h-0 flex-1">
				<div className="px-3 py-4">
					<UiRadioGroup
						aria-label="Theme"
						className="flex flex-col gap-1"
						onValueChange={(value) => onThemeChange(value as Theme)}
						value={theme}
					>
						{THEME_OPTIONS.map((option) => (
							<ThemeOptionRow
								key={option.value}
								option={option}
								selected={theme === option.value}
								systemTheme={systemTheme}
							/>
						))}
					</UiRadioGroup>
				</div>
			</UiScrollArea>
		</div>
	);
}

function ThemeOptionRow({
	option,
	selected,
	systemTheme,
}: {
	option: ThemeOption;
	selected: boolean;
	systemTheme: Exclude<Theme, "system">;
}) {
	const description =
		option.value === "system"
			? `Follow this device (${systemTheme} mode right now).`
			: option.description;
	const inputId = `settings-theme-${option.value}`;

	return (
		<label
			htmlFor={inputId}
			className={cn(
				"hover:bg-accent flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2.5 transition-colors",
				selected && "bg-accent",
			)}
		>
			<HugeiconsIcon className="text-muted-foreground shrink-0" icon={option.icon} size={18} />
			<span className="min-w-0 flex-1">
				<span className="block text-sm font-medium">{option.label}</span>
				<span className="text-muted-foreground block truncate text-xs">{description}</span>
			</span>
			<UiRadioGroupItem aria-label={option.label} id={inputId} value={option.value} />
		</label>
	);
}
