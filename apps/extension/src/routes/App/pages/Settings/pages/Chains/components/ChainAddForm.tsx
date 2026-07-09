import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

import type { ChainRecord } from "@/core/chains/application/ChainRecord";
import type { ChainGroupUi } from "@/routes/App/chainGroupUis";
import { UiButton } from "@/ui/UiButton/base";
import { UiInput } from "@/ui/UiInput/base";
import { UiScrollArea } from "@/ui/UiScrollArea";

type ChainAddFormProps = {
	error: string | null;
	groupUi: ChainGroupUi;
	isSubmitting: boolean;
	onSubmit: (chain: ChainRecord) => void;
};

/**
 * The common add-chain form: the shared shell (name + save) around the selected chain
 * group's own Create body. Chain-group-agnostic — each group plugs in its Create.
 */
export function ChainAddForm({ error, groupUi, isSubmitting, onSubmit }: ChainAddFormProps) {
	const [draft, setDraft] = useState<ChainRecord>(() => groupUi.createDraft(""));
	const Create = groupUi.Create;

	return (
		<div className="flex size-full min-h-0 flex-col">
			<header className="border-border/60 flex shrink-0 items-center gap-2 border-b px-3 py-3">
				<Link
					aria-label="Back to chains"
					className="text-muted-foreground hover:text-foreground shrink-0"
					to="/app/settings/chains"
				>
					<HugeiconsIcon icon={ArrowLeft01Icon} size={18} />
				</Link>
				<h1 className="text-base font-semibold">Add chain</h1>
			</header>
			<UiScrollArea className="min-h-0 flex-1">
				<div className="flex flex-col gap-4 px-5 py-4">
					<div className="flex items-center justify-between rounded-lg border px-3 py-2">
						<span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
							Chain type
						</span>
						<span className="text-sm font-medium">{groupUi.name}</span>
					</div>

					<div className="flex flex-col gap-1.5">
						<label className="text-sm font-medium" htmlFor="add-chain-name">
							Name
						</label>
						<UiInput
							id="add-chain-name"
							maxLength={40}
							onChange={(event) => setDraft({ ...draft, name: event.target.value })}
							placeholder="Chain name"
							value={draft.name}
						/>
					</div>

					<Create chain={draft} onChange={setDraft} />

					{error ? <p className="text-destructive text-sm">{error}</p> : null}
				</div>
			</UiScrollArea>
			<div className="border-border/60 shrink-0 border-t p-3">
				<UiButton
					className="w-full"
					disabled={isSubmitting || draft.name.trim().length === 0}
					onClick={() => onSubmit(draft)}
					size="lg"
					type="button"
				>
					{isSubmitting ? "Adding…" : "Add chain"}
				</UiButton>
			</div>
		</div>
	);
}
