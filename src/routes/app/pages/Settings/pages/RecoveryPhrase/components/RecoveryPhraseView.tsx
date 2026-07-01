import {
	ArrowLeft01Icon,
	Copy01Icon,
	ViewIcon,
	ViewOffSlashIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

import type { AccountGroupId } from "@/core/accounts/application/account-registry/model/identifiers";
import { cn } from "@/theme/utils.ts";
import { UiButtonVariants } from "@/ui/UiButton/base";
import { UiScrollArea } from "@/ui/UiScrollArea";

type RecoveryPhraseViewProps = {
	accountGroupId: AccountGroupId;
	phrase: string;
};

/**
 * Reveal screen: the mnemonic words hidden behind a blur until the user opts in, with
 * copy and a hard warning. Presentational — the caller fetches the phrase.
 */
export function RecoveryPhraseView({ accountGroupId, phrase }: RecoveryPhraseViewProps) {
	const [hidden, setHidden] = useState(true);
	const [copied, setCopied] = useState(false);
	const words = phrase.trim().split(/\s+/u);

	const handleCopy = () => {
		setCopied(true);

		if (navigator.clipboard) {
			void navigator.clipboard.writeText(phrase).catch(() => undefined);
		}

		globalThis.setTimeout(() => setCopied(false), 1500);
	};

	return (
		<div className="flex size-full min-h-0 flex-col">
			<header className="border-border/60 flex shrink-0 items-center gap-2 border-b px-3 py-3">
				<Link
					aria-label="Back to account settings"
					className="text-muted-foreground hover:text-foreground shrink-0"
					params={{ accountGroupId }}
					to="/app/settings/account/$accountGroupId"
				>
					<HugeiconsIcon icon={ArrowLeft01Icon} size={18} />
				</Link>
				<h1 className="truncate text-base font-semibold">Recovery phrase</h1>
			</header>

			<UiScrollArea className="min-h-0 flex-1">
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
									<span className="text-muted-foreground w-5 shrink-0 text-right tabular-nums">
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
						<span className="text-foreground font-semibold">Never share it with anyone.</span> Your
						recovery phrase gives full control of this wallet. If you lose it, you lose access to
						your funds and assets.
					</p>
				</div>
			</UiScrollArea>

			<div className="border-border/60 shrink-0 border-t p-3">
				<Link
					className={cn(UiButtonVariants({ size: "lg", variant: "outline" }), "w-full")}
					params={{ accountGroupId }}
					to="/app/settings/account/$accountGroupId"
				>
					Close
				</Link>
			</div>
		</div>
	);
}
