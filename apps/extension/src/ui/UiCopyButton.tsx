import { CheckmarkCircle02Icon, Copy01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type ReactNode, useEffect, useRef, useState } from "react";

const COPIED_RESET_MS = 1500;

type UiCopyButtonProps = {
	value: string;
	label?: string;
	className?: string;
	/**
	 * Trigger content. Pass a node to render it verbatim, or a function to receive the transient
	 * `copied` state (so call sites can swap their own icon/label). When omitted, a default
	 * copy icon + `label` is rendered and swaps to a checkmark + "Copied" on click.
	 */
	children?: ReactNode | ((copied: boolean) => ReactNode);
};

/**
 * Shared copy-to-clipboard trigger. Centralises the `navigator.clipboard.writeText` call plus the
 * transient "copied" acknowledgement (~1.5s) so call sites keep their own visuals via `children`.
 */
export function UiCopyButton({ value, label = "Copy", className, children }: UiCopyButtonProps) {
	const [copied, setCopied] = useState(false);
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		return () => {
			if (timeoutRef.current) clearTimeout(timeoutRef.current);
		};
	}, []);

	const handleCopy = async () => {
		try {
			await navigator.clipboard?.writeText?.(value);
		} catch {
			return; // don't flash a false acknowledgement if the write was rejected
		}
		setCopied(true);
		if (timeoutRef.current) clearTimeout(timeoutRef.current);
		timeoutRef.current = setTimeout(() => setCopied(false), COPIED_RESET_MS);
	};

	return (
		<button className={className} onClick={handleCopy} type="button">
			{typeof children === "function"
				? children(copied)
				: (children ?? (
						<>
							<HugeiconsIcon icon={copied ? CheckmarkCircle02Icon : Copy01Icon} size={18} />
							{copied ? "Copied" : label}
						</>
					))}
		</button>
	);
}
