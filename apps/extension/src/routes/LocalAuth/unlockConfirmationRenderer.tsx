import type { ConfirmationRenderer } from "@/common/Confirmation";
import { UNLOCK_CONFIRMATION_KIND } from "@/core/secure-vault/application/wallet-vault/unlockConfirmation";

import { LocalAuthPage } from "./index";

// The background advances the queue when the vault unlocks, so a successful unlock needs no response.
export const unlockConfirmationRenderer: ConfirmationRenderer = {
	kind: UNLOCK_CONFIRMATION_KIND,
	render: () => <LocalAuthPage />,
};
