import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";

import { usePasswordEntry } from "@/routes/LocalAuth/WalletUnlock";

import { RecoveryPhraseGate } from "./components/RecoveryPhraseGate";
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

export const Default: Story = {};

function WrongPasswordGate() {
	const entry = usePasswordEntry(async () => {
		throw new Error("Wrong password. Try again.");
	});

	return <RecoveryPhraseGate accountGroupId="account-group:1" entry={entry} />;
}

export const PasswordFirst: Story = {
	render: () => <WrongPasswordGate />,
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const show = canvas.getByRole("button", { name: "Show recovery phrase" });

		await expect(show).toBeDisabled();
		await userEvent.type(canvas.getByLabelText("Password"), "not-the-password");
		await userEvent.click(show);
		await expect(await canvas.findByText("Wrong password. Try again.")).toBeVisible();
	},
};
