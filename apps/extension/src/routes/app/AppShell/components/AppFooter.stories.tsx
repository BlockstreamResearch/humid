import type { Meta, StoryObj } from "@storybook/react-vite";

import { AppFooter } from "./AppFooter";

const meta = {
	title: "Pages/App/Footer",
	component: AppFooter,
	decorators: [
		(Story) => (
			<div className="flex size-full flex-col justify-end">
				<Story />
			</div>
		),
	],
} satisfies Meta<typeof AppFooter>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Home tab active. */
export const Home: Story = { args: { active: "home" } };

/** Settings tab active. */
export const Settings: Story = { args: { active: "settings" } };
