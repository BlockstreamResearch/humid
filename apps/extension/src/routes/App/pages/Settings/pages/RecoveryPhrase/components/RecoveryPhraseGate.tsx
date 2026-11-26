import { Page } from "@/common/Page";
import type { AccountGroupId } from "@/core/accounts/application/account-registry/model/identifiers";
import { PasswordField, type WalletUnlock } from "@/routes/LocalAuth/WalletUnlock";
import { UiButton } from "@/ui/UiButton/base";

const FORM_ID = "reveal-recovery-phrase";

export function RecoveryPhraseGate({
	accountGroupId,
	entry,
}: {
	accountGroupId: AccountGroupId;
	entry: WalletUnlock;
}) {
	return (
		<Page
			back={{
				label: "Back to account settings",
				params: { accountGroupId },
				to: "/app/settings/account/$accountGroupId",
			}}
			title="Recovery phrase"
			footer={
				<UiButton
					className="w-full"
					disabled={!entry.isFilled || entry.isPending}
					form={FORM_ID}
					size="lg"
					type="submit"
				>
					{entry.isPending ? "Checking…" : "Show recovery phrase"}
				</UiButton>
			}
		>
			<form className="flex flex-col gap-4 px-5 py-4" id={FORM_ID} onSubmit={entry.submit}>
				<p className="text-muted-foreground text-sm leading-6">
					Enter the password to show the recovery phrase. Make sure nobody can see the screen.
				</p>
				<PasswordField unlock={entry} disabled={entry.isPending} />
			</form>
		</Page>
	);
}
