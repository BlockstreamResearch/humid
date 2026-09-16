import type { Meta, StoryObj } from "@storybook/react-vite";

import { MockHomeProvider } from "../../HomeContext/mock";
import { OverviewPage } from "./index";

const meta = {
	title: "Pages/App/Home/Overview",
	component: OverviewPage,
	decorators: [
		(Story) => (
			<MockHomeProvider>
				<Story />
			</MockHomeProvider>
		),
	],
} satisfies Meta<typeof OverviewPage>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
