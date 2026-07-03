import { ClipboardPasteIcon, EraserIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";

import { UiButton } from "@/ui/UiButton/base";

import { useMnemonicImport } from "../hooks/useMnemonicImport";
import { MnemonicInputGrid } from "./MnemonicGrid";

export function ImportSeedTab({ onComplete }: { onComplete: (mnemonic: string) => void }) {
	const {
		clear,
		getInputProps,
		isComplete,
		isEmpty,
		isValid,
		mnemonic,
		pasteFromClipboard,
		words,
	} = useMnemonicImport();
	const [pasteHint, setPasteHint] = useState<string | null>(null);

	const handlePaste = async () => {
		const result = await pasteFromClipboard();

		if (result.ok) {
			setPasteHint(null);
			return;
		}

		if (result.error) console.warn("Clipboard read failed:", result.error);
		setPasteHint("Couldn't read the clipboard. Paste with Ctrl+V or type the words manually.");
	};

	const handleClear = () => {
		clear();
		setPasteHint(null);
	};

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center justify-between gap-2">
				<p className="text-muted-foreground text-sm leading-6">
					Enter or paste your 12-word recovery phrase.
				</p>
				<div className="flex shrink-0 items-center gap-1">
					<UiButton type="button" variant="ghost" size="sm" onClick={() => void handlePaste()}>
						<HugeiconsIcon icon={ClipboardPasteIcon} />
						Paste
					</UiButton>
					<UiButton
						type="button"
						variant="ghost"
						size="sm"
						disabled={isEmpty}
						onClick={handleClear}
					>
						<HugeiconsIcon icon={EraserIcon} />
						Clear
					</UiButton>
				</div>
			</div>

			<MnemonicInputGrid words={words} getInputProps={getInputProps} />

			{pasteHint && <p className="text-muted-foreground text-center text-xs">{pasteHint}</p>}

			{isComplete && !isValid && (
				<p className="text-destructive text-center text-sm">This recovery phrase is invalid.</p>
			)}

			<UiButton type="button" size="lg" disabled={!isValid} onClick={() => onComplete(mnemonic)}>
				Continue
			</UiButton>
		</div>
	);
}
