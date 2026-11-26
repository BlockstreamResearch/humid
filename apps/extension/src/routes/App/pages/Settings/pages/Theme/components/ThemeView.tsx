import { ComputerIcon, Moon02Icon, Sun03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ComponentProps } from "react";

import { Page } from "@/common/Page";
import type { Theme } from "@/contexts/ThemeProvider";
import { cn } from "@/theme/utils.ts";
import { UiRadioGroup, UiRadioGroupItem } from "@/ui/UiRadioGroup";

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

export function ThemeView({ onThemeChange, systemTheme, theme }: ThemeViewProps) {
	return (
		<Page back={{ label: "Back to settings", to: "/app/settings" }} title="Theme">
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
		</Page>
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
