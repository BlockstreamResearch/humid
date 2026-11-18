import type { ConfirmationRequest } from "@/helpers/background";

export const UNLOCK_CONFIRMATION_KIND = "walletUnlock";

export const UNLOCK_CONFIRMATION = {
	data: { kind: UNLOCK_CONFIRMATION_KIND },
	title: "Unlock Humid",
} satisfies ConfirmationRequest;
