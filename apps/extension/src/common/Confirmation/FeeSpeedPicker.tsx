import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";

import { ConfirmationSection } from "./ConfirmationParts";

export type FeeSpeed = { id: string; name: string; time: string };

export function FeeSpeedPicker({
	speeds,
	value,
	fee,
	onChange,
}: {
	speeds: FeeSpeed[];
	value: string;
	fee: string;
	onChange: (id: string) => void;
}) {
	return (
		<ConfirmationSection
			title="Network fee"
			aside={<span className="font-mono text-sm font-semibold tabular-nums">{fee}</span>}
		>
			<RadioGroup
				aria-label="Fee speed"
				value={value}
				onValueChange={(next) => onChange(next as string)}
				className="bg-muted mt-1 mb-2.5 grid grid-cols-3 gap-1 rounded-lg p-1"
			>
				{speeds.map((speed) => (
					<Radio.Root
						key={speed.id}
						value={speed.id}
						className="data-[checked]:bg-background flex cursor-pointer flex-col items-center gap-0.5 rounded-md px-1 py-1.5 outline-none focus-visible:ring-3 data-[checked]:shadow-sm"
					>
						<span className="text-[13px] font-semibold">{speed.name}</span>
						<span className="text-muted-foreground text-[11px]">{speed.time}</span>
					</Radio.Root>
				))}
			</RadioGroup>
		</ConfirmationSection>
	);
}
