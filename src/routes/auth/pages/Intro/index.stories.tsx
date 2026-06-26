import type { Meta, StoryObj } from "@storybook/react-vite";

import { AuthIntroPage } from "./index";

const meta = {
	title: "Pages/Auth/Intro",
	component: AuthIntroPage,
} satisfies Meta<typeof AuthIntroPage>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Entry screen shown when no local vault exists yet. */
export const Default: Story = {};
