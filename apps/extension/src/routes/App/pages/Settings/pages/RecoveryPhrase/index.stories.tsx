import type { Meta, StoryObj } from "@storybook/react-vite";

import { RecoveryPhraseView } from "./components/RecoveryPhraseView";

const meta = {
	title: "Pages/App/Settings/RecoveryPhrase",
	component: RecoveryPhraseView,
	args: {
		accountGroupId: "account-group:1",
		phrase:
			"wallet mirror speed deposit cinnamon agree basic husband festival march federal supreme",
	},
} satisfies Meta<typeof RecoveryPhraseView>;

export default meta;

type Story = StoryObj<typeof meta>;

/** The reveal screen with the phrase hidden by default (toggle the eye to reveal). */
export const Default: Story = {};
