import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import { PreparingConfirmation } from "./PreparingConfirmation";

const meta = {
	title: "Confirmation/PreparingConfirmation",
	component: PreparingConfirmation,
} satisfies Meta<typeof PreparingConfirmation>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
	play: async ({ canvasElement }) => {
		await expect(within(canvasElement).getByText("Preparing the request…")).toBeVisible();
	},
};
