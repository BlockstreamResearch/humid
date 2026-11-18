import { useState } from "react";

import { Page } from "@/common/Page";
import type { ChainRecord } from "@/core/chains/application/ChainRecord";
import type { ChainGroupUi } from "@/routes/App/chainGroupUis";
import { UiButton } from "@/ui/UiButton/base";
import { UiInput } from "@/ui/UiInput/base";

type ChainAddFormProps = {
	error: string | null;
	groupUi: ChainGroupUi;
	isSubmitting: boolean;
	onSubmit: (chain: ChainRecord) => void;
};

export function ChainAddForm({ error, groupUi, isSubmitting, onSubmit }: ChainAddFormProps) {
	const [draft, setDraft] = useState<ChainRecord>(() => groupUi.createDraft(""));
	const Create = groupUi.Create;

	return (
		<Page
			back={{ label: "Back to networks", to: "/app/settings/chains" }}
			title="Add network"
			footer={
				<UiButton
					className="w-full"
					disabled={isSubmitting || draft.name.trim().length === 0}
					onClick={() => onSubmit(draft)}
					size="lg"
					type="button"
				>
					{isSubmitting ? "Adding…" : "Add network"}
				</UiButton>
			}
		>
			<div className="flex flex-col gap-4 px-5 py-4">
				<div className="flex items-center justify-between rounded-lg border px-3 py-2">
					<span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
						Protocol
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
						placeholder="Network name"
						value={draft.name}
					/>
				</div>

				<Create chain={draft} onChange={setDraft} />

				{error ? <p className="text-destructive text-sm">{error}</p> : null}
			</div>
		</Page>
	);
}
