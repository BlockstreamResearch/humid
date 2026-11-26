import { Copy01Icon, ViewIcon, ViewOffSlashIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { Page } from "@/common/Page";
import type { AccountGroupId } from "@/core/accounts/application/account-registry/model/identifiers";
import { cn } from "@/theme/utils.ts";
import { UiButtonVariants } from "@/ui/UiButton/base";

type RecoveryPhraseViewProps = {
	accountGroupId: AccountGroupId;
	phrase: string;
};

const CLIPBOARD_CLEAR_MS = 60_000;

export function RecoveryPhraseView({ accountGroupId, phrase }: RecoveryPhraseViewProps) {
	const [hidden, setHidden] = useState(true);
	const [copied, setCopied] = useState(false);
	const onClipboard = useRef(false);
	const words = phrase.trim().split(/\s+/u);

	// Leaving the page or a minute passing wipes the phrase from the clipboard, as far as the browser allows.
	const clearClipboard = () => {
		if (!onClipboard.current) return;

		onClipboard.current = false;
		void navigator.clipboard?.writeText("").catch(() => undefined);
	};

	useEffect(() => clearClipboard, []);

	const handleCopy = () => {
		setCopied(true);
		onClipboard.current = true;
		void navigator.clipboard?.writeText(phrase).catch(() => undefined);
		globalThis.setTimeout(clearClipboard, CLIPBOARD_CLEAR_MS);
		globalThis.setTimeout(() => setCopied(false), 1500);
	};

	return (
		<Page
			back={{
				label: "Back to account settings",
				params: { accountGroupId },
				to: "/app/settings/account/$accountGroupId",
			}}
			title="Recovery phrase"
			footer={
				<Link
					className={cn(UiButtonVariants({ size: "lg", variant: "outline" }), "w-full")}
					params={{ accountGroupId }}
					to="/app/settings/account/$accountGroupId"
				>
					Close
				</Link>
			}
		>
			<div className="flex flex-col gap-4 px-5 py-4">
				<div className="flex items-center justify-between">
					<p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
						Recovery phrase
					</p>
					<button
						className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs font-medium"
						onClick={handleCopy}
						type="button"
					>
						<HugeiconsIcon icon={Copy01Icon} size={14} />
						{copied ? "Copied" : "Copy"}
					</button>
				</div>

				<div className="relative">
					<div className="bg-muted/40 grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border p-3">
						{words.map((word, index) => (
							// eslint-disable-next-line react/no-array-index-key -- fixed positional slots
							<span key={index} className="flex items-center gap-2 font-mono text-sm">
								<span className="text-muted-foreground w-7 shrink-0 text-right tabular-nums">
									{index + 1}.
								</span>
								<span className={cn("truncate", hidden && "blur-[5px] select-none")}>{word}</span>
							</span>
						))}
					</div>
					<button
						aria-label={hidden ? "Reveal recovery phrase" : "Hide recovery phrase"}
						className="bg-background/70 text-muted-foreground hover:text-foreground absolute top-2 right-2 rounded-full border p-1.5 backdrop-blur"
						onClick={() => setHidden((value) => !value)}
						type="button"
					>
						<HugeiconsIcon icon={hidden ? ViewIcon : ViewOffSlashIcon} size={16} />
					</button>
				</div>

				<p className="text-muted-foreground text-sm leading-6">
					<span className="text-foreground font-semibold">Never share it with anyone.</span> The
					recovery phrase gives full control of this wallet. If lost, the funds and assets in the
					wallet can&apos;t be recovered.
				</p>
			</div>
		</Page>
	);
}
