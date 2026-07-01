import type { Meta, StoryObj } from "@storybook/react-vite";

import { MockHomeProvider } from "@/routes/App/pages/Home/HomeContext/mock";

import { HomeHeader } from "./index";

const meta = {
	title: "Pages/App/Home/Overview/Header",
	component: HomeHeader,
	decorators: [
		(Story) => (
			<MockHomeProvider>
				<Story />
			</MockHomeProvider>
		),
	],
} satisfies Meta<typeof HomeHeader>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Header with the stub account and chains — open a selector to switch. */
export const Default: Story = {};
