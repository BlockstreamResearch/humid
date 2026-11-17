import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";

import { ConfirmationSection } from "./ConfirmationParts";

export const FEE_SPEEDS = [
	{ name: "Slow", targetBlocks: 60, time: "~1 hour" },
	{ name: "Normal", targetBlocks: 10, time: "~10 min" },
	{ name: "Fast", targetBlocks: 1, time: "~1 min" },
];

export const DEFAULT_TARGET_BLOCKS = 1;

type SpeedFee = { feeSats: string; targetBlocks: number };

export function FeeSpeedPicker({
	value,
	fees,
	onChange,
}: {
	value: number;
	fees: SpeedFee[];
	onChange: (targetBlocks: number) => void;
}) {
	const feeAt = (targetBlocks: number) =>
		fees.find((fee) => fee.targetBlocks === targetBlocks)?.feeSats;
	const timeAt = (targetBlocks: number) => {
		const paid = BigInt(feeAt(targetBlocks) ?? 0);
		const fastest = FEE_SPEEDS.toSorted((a, b) => a.targetBlocks - b.targetBlocks).find(
			(speed) => BigInt(feeAt(speed.targetBlocks) ?? paid + 1n) <= paid,
		);

		return (fastest ?? FEE_SPEEDS.find((speed) => speed.targetBlocks === targetBlocks)!).time;
	};

	return (
		<ConfirmationSection
			title="Network fee"
			aside={
				<span className="font-mono text-sm font-semibold tabular-nums">{feeAt(value)} sats</span>
			}
		>
			<RadioGroup
				aria-label="Fee speed"
				value={String(value)}
				onValueChange={(next) => onChange(Number(next))}
				className="bg-muted mt-1 mb-2.5 grid grid-cols-3 gap-1 rounded-lg p-1"
			>
				{FEE_SPEEDS.map((speed) => (
					<Radio.Root
						key={speed.targetBlocks}
						value={String(speed.targetBlocks)}
						className="data-[checked]:bg-background flex cursor-pointer flex-col items-center gap-0.5 rounded-md px-1 py-1.5 outline-none focus-visible:ring-3 data-[checked]:shadow-sm"
					>
						<span className="text-[13px] font-semibold">{speed.name}</span>
						<span className="text-muted-foreground text-[11px]">{timeAt(speed.targetBlocks)}</span>
					</Radio.Root>
				))}
			</RadioGroup>
		</ConfirmationSection>
	);
}
