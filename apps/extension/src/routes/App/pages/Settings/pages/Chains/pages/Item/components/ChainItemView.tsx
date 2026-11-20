import type { ReactNode } from "react";

import { Page } from "@/common/Page";
import { UiButton } from "@/ui/UiButton/base";

type ChainItemViewProps = {
	children: ReactNode;
	chainName: string;
	isRemoving?: boolean;
	isSaving: boolean;
	onRemove?: () => void;
	onSave: () => void;
};

export function ChainItemView({
	children,
	chainName,
	isRemoving,
	isSaving,
	onRemove,
	onSave,
}: ChainItemViewProps) {
	return (
		<Page
			back={{ label: "Back to networks", to: "/app/settings/chains" }}
			title={chainName}
			footer={
				<UiButton className="w-full" disabled={isSaving} onClick={onSave} size="lg" type="button">
					{isSaving ? "Saving…" : "Save"}
				</UiButton>
			}
		>
			<div className="flex flex-col gap-6 px-5 py-4">
				{children}
				{onRemove ? (
					<UiButton
						className="w-full"
						disabled={isRemoving}
						onClick={onRemove}
						type="button"
						variant="destructive"
					>
						{isRemoving ? "Removing…" : "Remove network"}
					</UiButton>
				) : null}
			</div>
		</Page>
	);
}
