import type { Meta, StoryObj } from "@storybook/react-vite";

import UiPageBackgroundWrp from "@/ui/UiPageBackgroundWrp";

import { AuthIntroPage } from "./index";

const meta = {
	title: "Pages/Auth/Intro",
	component: () => (
		<UiPageBackgroundWrp>
			<AuthIntroPage />
		</UiPageBackgroundWrp>
	),
} satisfies Meta<typeof AuthIntroPage>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
