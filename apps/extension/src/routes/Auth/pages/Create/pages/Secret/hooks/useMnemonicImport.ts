import {
	type ChangeEvent,
	type ClipboardEvent,
	useCallback,
	useMemo,
	useRef,
	useState,
} from "react";

import { keyManagerSecretMaterial } from "@/core/key-manager/secret-material";

const MNEMONIC_WORD_COUNT = 12;

function createEmptyWords(): string[] {
	return Array.from({ length: MNEMONIC_WORD_COUNT }, () => "");
}

/**
 * Legacy clipboard read via a hidden textarea. Runs synchronously inside the click
 * gesture and works in extension pages holding the `clipboardRead` permission —
 * more reliable there than the async Clipboard API. Returns "" when unavailable.
 */
function readClipboardViaExecCommand(): string {
	try {
		const textarea = document.createElement("textarea");
		textarea.style.cssText =
			"position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:0;opacity:0;";
		document.body.append(textarea);
		textarea.focus();
		const pasted = document.execCommand("paste");
		const value = textarea.value;
		textarea.remove();

		return pasted ? value : "";
	} catch {
		return "";
	}
}

/**
 * Manages the 12-word import grid: per-input state, focus tracking, and paste.
 *
 * - A field paste / typed space fills forward from that field (additive).
 * - The Paste button and clipboard read overwrite from the first field.
 *
 * In both cases the split is on whitespace and anything past the last slot is
 * truncated.
 */
export function useMnemonicImport() {
	const [words, setWords] = useState<string[]>(createEmptyWords);
	const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
	const focusedIndexRef = useRef(0);

	const fillWords = useCallback((text: string, startIndex: number, overwrite: boolean) => {
		const pastedWords = keyManagerSecretMaterial.splitMnemonicWords(text);

		if (pastedWords.length === 0) return;

		const fillCount = Math.min(pastedWords.length, MNEMONIC_WORD_COUNT - startIndex);

		setWords((current) => {
			const next = overwrite ? createEmptyWords() : [...current];

			for (let offset = 0; offset < fillCount; offset += 1) {
				next[startIndex + offset] = pastedWords[offset];
			}

			return next;
		});

		const focusTarget = Math.min(startIndex + fillCount, MNEMONIC_WORD_COUNT - 1);
		requestAnimationFrame(() => inputRefs.current[focusTarget]?.focus());
	}, []);

	const getInputProps = useCallback(
		(index: number) => ({
			ref: (element: HTMLInputElement | null) => {
				inputRefs.current[index] = element;
			},
			value: words[index] ?? "",
			onChange: (event: ChangeEvent<HTMLInputElement>) => {
				const value = event.target.value;

				// A space (typed or pasted mid-field) distributes forward from this field.
				if (/\s/.test(value)) {
					fillWords(value, index, false);
					return;
				}

				setWords((current) =>
					current.map((word, wordIndex) => (wordIndex === index ? value : word)),
				);
			},
			onFocus: () => {
				focusedIndexRef.current = index;
			},
			onPaste: (event: ClipboardEvent<HTMLInputElement>) => {
				event.preventDefault();
				fillWords(event.clipboardData.getData("text"), index, false);
			},
		}),
		[words, fillWords],
	);

	/**
	 * Paste button: read the clipboard and overwrite the whole grid from the start.
	 * Tries the legacy in-gesture path first (reliable in extension popups), then the
	 * async Clipboard API. Returns the read error so the UI can surface it.
	 */
	const pasteFromClipboard = useCallback(async (): Promise<{ error?: string; ok: boolean }> => {
		const legacyText = readClipboardViaExecCommand();

		if (legacyText) {
			fillWords(legacyText, 0, true);
			return { ok: true };
		}

		try {
			const text = await navigator.clipboard?.readText?.();

			if (text) {
				fillWords(text, 0, true);
				return { ok: true };
			}

			return { ok: false };
		} catch (error) {
			return { error: error instanceof Error ? error.message : String(error), ok: false };
		}
	}, [fillWords]);

	const clear = useCallback(() => {
		setWords(createEmptyWords());
		requestAnimationFrame(() => inputRefs.current[0]?.focus());
	}, []);

	const mnemonic = useMemo(
		() => keyManagerSecretMaterial.normalizeMnemonic(words.join(" ")),
		[words],
	);
	const isEmpty = words.every((word) => word.trim().length === 0);
	const isComplete = words.every((word) => word.trim().length > 0);
	const isValid = isComplete && keyManagerSecretMaterial.isValidMnemonic(mnemonic);

	return {
		clear,
		getInputProps,
		isComplete,
		isEmpty,
		isValid,
		mnemonic,
		pasteFromClipboard,
		words,
	};
}
