import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { ProcessCtConfirmation, ProcessCtUnreadable } from "./ProcessCtConfirmation";
import { LENDING_OFFER } from "./processCtFixtures";

const meta = {
	title: "Dapp/ContractActionConfirmation",
	component: ProcessCtConfirmation,
	args: {
		data: LENDING_OFFER,
		origin: "https://app.lending.example",
		onConfirm: fn(),
		onReject: fn(),
	},
} satisfies Meta<typeof ProcessCtConfirmation>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
	play: async ({ args, canvasElement }) => {
		const canvas = within(canvasElement);

		await expect(canvas.getByRole("heading", { name: "Create offer" })).toBeVisible();
		await expect(canvas.getByText("Described by the dapp")).toBeVisible();
		await expect(canvas.getByText("−0.00500052")).toBeVisible();
		await expect(canvas.getByText("Unknown asset, raw units")).toBeVisible();
		await expect(canvas.getByText("52 sats")).toBeVisible();
		await userEvent.click(canvas.getByRole("radio", { name: /slow/i }));
		await expect(canvas.getByText("−0.00500026")).toBeVisible();
		await expect(canvas.getByText("Signing with Account 0")).toBeVisible();

		await userEvent.click(canvas.getByRole("button", { name: /details/i }));
		await expect(canvas.getAllByText("Lending contract")[0]).toBeVisible();
		await expect(canvas.getByText("This account, change")).toBeVisible();
		await expect(canvas.getByText("50 bytes")).toBeVisible();

		await userEvent.click(canvas.getByRole("button", { name: /sign and send/i }));
		await expect(args.onConfirm).toHaveBeenCalledWith({ targetBlocks: 60 });
	},
};

export const HandedBackToTheDapp: Story = {
	args: { data: { ...LENDING_OFFER, broadcast: false } },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);

		await expect(canvas.getByRole("button", { name: /^sign$/i })).toBeVisible();
		await expect(canvas.getByText(/back to the dapp to send/)).toBeVisible();
	},
};

export const Unreadable: StoryObj<typeof ProcessCtUnreadable> = {
	render: () => (
		<ProcessCtUnreadable
			origin="https://app.lending.example"
			network="Liquid Testnet"
			onClose={fn()}
		/>
	),
};
