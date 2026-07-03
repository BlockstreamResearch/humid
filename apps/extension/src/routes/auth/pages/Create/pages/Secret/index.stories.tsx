import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";

import { AuthCreateProvider } from "../../index";
import { AuthCreateSecretPage } from "./index";

const meta = {
	title: "Pages/Auth/Create/Step 1 Secret",
	component: AuthCreateSecretPage,
	decorators: [
		(Story) => (
			<AuthCreateProvider>
				<Story />
			</AuthCreateProvider>
		),
	],
} satisfies Meta<typeof AuthCreateSecretPage>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Create tab: a fresh BIP-39 recovery phrase is generated and shown for backup. */
export const Create: Story = {};

/** Import tab: an empty 12-word grid ready for manual entry or paste-to-fill. */
export const Import: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);

		await userEvent.click(canvas.getByRole("tab", { name: /import/i }));
	},
};
