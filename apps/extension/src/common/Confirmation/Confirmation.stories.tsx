import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, userEvent, within } from "storybook/test";

import { ConfirmationDetails, DetailsGroup, DetailsRow } from "./ConfirmationDetails";
import { ConfirmationActions, ConfirmationLayout } from "./ConfirmationLayout";
import { AmountRow, ConfirmationNote, ConfirmationSection } from "./ConfirmationParts";
import { DefaultConfirmation } from "./DefaultConfirmation";
import { type FeeSpeed, FeeSpeedPicker } from "./FeeSpeedPicker";
import { ShownAsset } from "./ShownAsset";

const LBTC = new ShownAsset(
	"144c654344aa716d6f3abcc1ca90e5641e4e2a7f633bc09fe3baf64585819a49",
	"L-BTC",
	8,
);
const RECEIPT = new ShownAsset("3f9a8d6c2b1e4f7a9c0d5e3b8a6f1c2d4e7b9a0c3d5f8e1b2a4c6d9f0e3c21e");
const FACTORY = new ShownAsset(
	"5b7e2c9a4d1f8e3b6a0c7d2e9f4b1a8c5d3e7f0a2b9c6d4e1f8a3b5c7d0e9d913",
	undefined,
	0,
);

const SPEEDS: FeeSpeed[] = [
	{ id: "slow", name: "Slow", time: "~1 hour" },
	{ id: "normal", name: "Normal", time: "~10 min" },
	{ id: "fast", name: "Fast", time: "Next block" },
];
const FEES: Record<string, string> = { slow: "26 sats", normal: "39 sats", fast: "52 sats" };

function ContractAction({ onReject, onConfirm }: { onReject: () => void; onConfirm: () => void }) {
	const [speed, setSpeed] = useState("fast");

	return (
		<ConfirmationLayout
			origin="https://app.lending.example"
			network="Liquid testnet"
			title="Create a lending offer"
			statement="Lend out 100 USDt against 0.005 L-BTC of collateral."
			statementByDapp="Described by the dapp"
			footer={
				<ConfirmationActions
					signer="Signing with Account 0"
					confirmLabel="Confirm"
					onReject={onReject}
					onConfirm={onConfirm}
				/>
			}
		>
			<ConfirmationSection title="Balance changes">
				<AmountRow asset={LBTC} units={-500_000n} note="Locked as collateral" />
				<AmountRow asset={RECEIPT} units={1n} />
			</ConfirmationSection>
			<FeeSpeedPicker speeds={SPEEDS} value={speed} fee={FEES[speed]!} onChange={setSpeed} />
			<ConfirmationNote>
				The change stays unblinded on-chain, so the next action can spend those funds.
			</ConfirmationNote>
			<ConfirmationDetails summary="3 inputs · 4 outputs">
				<DetailsGroup title="Inputs">
					<DetailsRow
						index={1}
						label="Issuance factory"
						note="tex1pz4…8m3d"
						value={FACTORY.amountWithLabel(1n)}
					/>
					<DetailsRow
						index={2}
						label="This account"
						note="tlq1qq7m…9x2v"
						value={LBTC.amountWithLabel(1_000_000n)}
					/>
					<DetailsRow
						index={3}
						label="This account"
						note="tlq1qqk4…2r8n"
						value={LBTC.amountWithLabel(734_619n)}
					/>
				</DetailsGroup>
				<DetailsGroup title="Outputs">
					<DetailsRow
						index={1}
						label="Lending contract"
						note="tex1pq9…7xk2"
						value={LBTC.amountWithLabel(500_000n)}
					/>
					<DetailsRow
						index={2}
						label="Issuance factory"
						note="tex1pz4…8m3d"
						value={FACTORY.amountWithLabel(1n)}
					/>
					<DetailsRow
						index={3}
						label="Offer record"
						note="Provided by the dapp"
						noteByDapp
						value="50 bytes"
					/>
					<DetailsRow
						index={4}
						label="This account, change"
						note="tex1qd2…8kq4"
						value={LBTC.amountWithLabel(1_234_567n)}
					/>
				</DetailsGroup>
			</ConfirmationDetails>
		</ConfirmationLayout>
	);
}

const meta = {
	title: "Confirmation/Kit",
	component: ContractAction,
	args: { onReject: fn(), onConfirm: fn() },
} satisfies Meta<typeof ContractAction>;

export default meta;

type Story = StoryObj<typeof meta>;

export const ContractActionScreen: Story = {};

export const PicksAFeeSpeed: Story = {
	play: async ({ args, canvasElement }) => {
		const canvas = within(canvasElement);

		await expect(canvas.getByText("52 sats")).toBeInTheDocument();
		await userEvent.click(canvas.getByRole("radio", { name: /slow/i }));
		await expect(canvas.getByText("26 sats")).toBeInTheDocument();

		await userEvent.click(canvas.getByRole("button", { name: /details/i }));
		await expect(canvas.getByText("Lending contract")).toBeInTheDocument();

		await userEvent.click(canvas.getByRole("button", { name: /confirm/i }));
		await expect(args.onConfirm).toHaveBeenCalled();
	},
};

export const GenericRequest: StoryObj<typeof DefaultConfirmation> = {
	render: () => (
		<DefaultConfirmation
			request={{
				title: "Sign Liquid PSET?",
				confirmLabel: "Sign",
				message: "Return the signed PSET to the dapp; do not broadcast.",
				requester: { origin: "https://app.lending.example" },
			}}
			onConfirm={fn()}
			onDecline={fn()}
		/>
	),
};

export const WarningNote: StoryObj<typeof ConfirmationNote> = {
	render: () => (
		<div className="p-4">
			<ConfirmationNote tone="warning">
				Input 2 signs with SINGLE | ANYONECANPAY, so the dapp can still add inputs and outputs.
			</ConfirmationNote>
		</div>
	),
};
