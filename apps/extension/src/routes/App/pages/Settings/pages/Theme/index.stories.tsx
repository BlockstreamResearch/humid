import type { Meta, StoryObj } from "@storybook/react-vite";

import { ThemeView } from "./components/ThemeView";

const meta = {
	title: "Pages/App/Settings/Theme",
	component: ThemeView,
	args: {
		onThemeChange: () => {},
		systemTheme: "dark",
		theme: "system",
	},
} satisfies Meta<typeof ThemeView>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Theme settings with the system appearance selected. */
export const Default: Story = {};
