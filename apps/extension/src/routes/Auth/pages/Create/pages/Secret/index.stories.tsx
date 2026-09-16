import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";

import UiPageBackgroundWrp from "@/ui/UiPageBackgroundWrp";

import { AuthCreateProvider } from "../../index";
import { AuthCreateSecretPage } from "./index";

const meta = {
	title: "Pages/Auth/Create/Step 1 Secret",
	component: AuthCreateSecretPage,
	decorators: [
		(Story) => (
			<AuthCreateProvider>
				<UiPageBackgroundWrp>
					<Story />
				</UiPageBackgroundWrp>
			</AuthCreateProvider>
		),
	],
} satisfies Meta<typeof AuthCreateSecretPage>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Create: Story = {};

export const Import: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);

		await userEvent.click(canvas.getByRole("tab", { name: /import/i }));
	},
};
