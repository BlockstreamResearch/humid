import type { Meta, StoryObj } from "@storybook/react-vite";

import { UiCopyButton } from "./UiCopyButton";

/** A reusable button-ish shell so the trigger reads as an actual control in isolation. */
const TRIGGER_CLASS =
	"inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-accent";

const meta = {
	title: "UI/UiCopyButton",
	component: UiCopyButton,
	render: (args) => (
		<div className="flex size-full items-center justify-center p-5">
			<UiCopyButton {...args} />
		</div>
	),
	args: {
		className: TRIGGER_CLASS,
		value: "lq1qqw8re6enadhd82hk9m445kr78e7rlddcu58vypmk9mqa7e989ph30xe8ag",
	},
	argTypes: {
		children: { control: false },
	},
} satisfies Meta<typeof UiCopyButton>;

export default meta;

type Story = StoryObj<typeof meta>;

/** The built-in look: a copy icon + the default "Copy" label, swapping to a checkmark + "Copied". */
export const Default: Story = {};

/** The built-in look with a custom label. */
export const CustomLabel: Story = {
	args: { label: "Copy address" },
};

/** A verbatim node child — rendered as-is, with no copied-state affordance of its own. */
export const NodeChildren: Story = {
	args: {
		children: <span className="text-primary font-medium underline">Copy transaction id</span>,
	},
};

/** A function child that reads the transient `copied` flag to swap its own content. */
export const RenderChildren: Story = {
	args: {
		children: (copied: boolean) => (
			<span className={copied ? "font-medium text-emerald-500" : "font-medium"}>
				{copied ? "Copied to clipboard" : "Copy secret"}
			</span>
		),
	},
};

/** A long value: the click still copies the whole string; only the label is shown. */
export const LongValue: Story = {
	args: {
		label: "Copy descriptor",
		value:
			"ct(slip77(0e95e2ee6e3e0f9d0f8b2a9f4b1c6d8e2f3a4b5c6d7e8f90a1b2c3d4e5f6071),elwpkh([73c5da0a/84h/1h/0h]xpub6BosfCnifzxcJJ1wYuntGJfF2zPJkDeG9ELNHcKNjezuea4tumswN9sH1psMdSVqCMoJC21Bv8usSeqSP4Sp1tLzW7aY59fGn9GCYzx5UT/0/*))",
	},
};
