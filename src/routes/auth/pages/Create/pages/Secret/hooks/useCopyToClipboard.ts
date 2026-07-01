import { useCallback, useEffect, useRef, useState } from "react";

/** Copies text to the clipboard and exposes a transient `copied` flag. */
export function useCopyToClipboard(resetMs = 1500) {
	const [copied, setCopied] = useState(false);
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		return () => {
			if (timeoutRef.current) clearTimeout(timeoutRef.current);
		};
	}, []);

	const copy = useCallback(
		async (text: string) => {
			try {
				await navigator.clipboard.writeText(text);
				setCopied(true);

				if (timeoutRef.current) clearTimeout(timeoutRef.current);
				timeoutRef.current = setTimeout(() => setCopied(false), resetMs);
			} catch {
				// Clipboard write is unavailable; keep the flag false.
			}
		},
		[resetMs],
	);

	return { copied, copy };
}
