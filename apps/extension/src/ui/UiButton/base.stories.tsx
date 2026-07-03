import type { Meta, StoryObj } from "@storybook/react-vite";

import { UiButton } from "./base";

const meta = {
	title: "UI/UiButton",
	component: UiButton,
	args: {
		children: "Button",
		variant: "default",
		size: "default",
	},
	argTypes: {
		variant: {
			control: "select",
			options: ["default", "outline", "secondary", "ghost", "destructive", "link"],
		},
		size: {
			control: "select",
			options: ["default", "xs", "sm", "lg", "icon", "icon-xs", "icon-sm", "icon-lg"],
		},
	},
} satisfies Meta<typeof UiButton>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Outline: Story = {
	args: { variant: "outline" },
};

export const Secondary: Story = {
	args: { variant: "secondary" },
};

export const Destructive: Story = {
	args: { variant: "destructive" },
};
