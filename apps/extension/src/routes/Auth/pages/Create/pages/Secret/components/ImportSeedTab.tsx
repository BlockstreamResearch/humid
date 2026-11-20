import { ClipboardPasteIcon, EraserIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";

import { logger } from "@/core/logger";
import { UiButton } from "@/ui/UiButton/base";

import { useAuthCreateContext } from "../../../index";
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
	} = useMnemonicImport(useAuthCreateContext().importedSeed);
	const [pasteHint, setPasteHint] = useState<string | null>(null);

	const handlePaste = async () => {
		const result = await pasteFromClipboard();

		if (result.ok) {
			setPasteHint(null);
			return;
		}

		if (result.error) logger.warn("Clipboard read failed", { error: result.error });
		setPasteHint(
			"Couldn't read the clipboard. Paste into the first box instead, or type the words.",
		);
	};

	const handleClear = () => {
		clear();
		setPasteHint(null);
	};

	return (
		<div className="flex flex-col gap-4">
			<p className="text-muted-foreground text-center text-sm leading-6">
				Enter or paste the 12-word recovery phrase.
			</p>

			<MnemonicInputGrid words={words} getInputProps={getInputProps} />

			<div className="flex items-center justify-center gap-3">
				<UiButton type="button" variant="ghost" size="sm" onClick={() => void handlePaste()}>
					<HugeiconsIcon icon={ClipboardPasteIcon} />
					Paste
				</UiButton>
				<UiButton type="button" variant="ghost" size="sm" disabled={isEmpty} onClick={handleClear}>
					<HugeiconsIcon icon={EraserIcon} />
					Clear
				</UiButton>
			</div>

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
