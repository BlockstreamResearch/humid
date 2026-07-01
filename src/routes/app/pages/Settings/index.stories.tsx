import type { Meta, StoryObj } from "@storybook/react-vite";

import { AppSettingsPage } from "./index";

const meta = {
	title: "Pages/App/Settings",
	component: AppSettingsPage,
} satisfies Meta<typeof AppSettingsPage>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Placeholder Settings tab with its own header. */
export const Default: Story = {};
