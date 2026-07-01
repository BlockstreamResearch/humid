import type { ComponentPropsWithRef, ReactNode } from "react";

import { cn } from "@/theme/utils.ts";

function MnemonicCell({ index, children }: { index: number; children: ReactNode }) {
	return (
		<div className="bg-muted flex items-center gap-2 rounded-lg px-3 py-2.5">
			<span className="text-muted-foreground w-5 shrink-0 text-right font-mono text-sm tabular-nums">
				{index + 1}.
			</span>
			{children}
		</div>
	);
}

export function MnemonicDisplayGrid({
	words,
	hidden = false,
}: {
	words: string[];
	hidden?: boolean;
}) {
	return (
		<div className="grid grid-cols-2 gap-2">
			{words.map((word, index) => (
				// eslint-disable-next-line react/no-array-index-key -- fixed positional slots
				<MnemonicCell key={index} index={index}>
					<span className={cn("truncate font-mono text-sm", hidden && "select-none blur-[5px]")}>
						{word}
					</span>
				</MnemonicCell>
			))}
		</div>
	);
}

export type MnemonicInputGridProps = {
	words: string[];
	getInputProps: (index: number) => ComponentPropsWithRef<"input">;
	disabled?: boolean;
};

export function MnemonicInputGrid({ words, getInputProps, disabled }: MnemonicInputGridProps) {
	return (
		<div className="grid grid-cols-2 gap-2">
			{words.map((_, index) => (
				// eslint-disable-next-line react/no-array-index-key -- fixed positional slots
				<MnemonicCell key={index} index={index}>
					<input
						{...getInputProps(index)}
						disabled={disabled}
						autoCapitalize="off"
						autoComplete="off"
						autoCorrect="off"
						className="text-foreground placeholder:text-muted-foreground/50 w-full min-w-0 bg-transparent font-mono text-sm outline-none disabled:opacity-50"
						spellCheck={false}
					/>
				</MnemonicCell>
			))}
		</div>
	);
}
