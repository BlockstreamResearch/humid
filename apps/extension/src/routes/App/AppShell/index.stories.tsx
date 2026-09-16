import type { Meta, StoryObj } from "@storybook/react-vite";

import { MockHomeProvider } from "../pages/Home/HomeContext/mock";
import { OverviewPage } from "../pages/Home/pages/Overview";
import { AppShell } from "./index";

const meta = {
	title: "Pages/App/Shell",
	component: AppShell,
} satisfies Meta<typeof AppShell>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
	args: {
		children: (
			<MockHomeProvider>
				<OverviewPage />
			</MockHomeProvider>
		),
	},
};
