import type { ConfirmationRequest } from "@/helpers/background";

export const UNLOCK_CONFIRMATION_KIND = "walletUnlock";

export const UNLOCK_CONFIRMATION = {
	data: { kind: UNLOCK_CONFIRMATION_KIND },
	title: "Unlock Humid",
	timeoutMs: 5 * 60_000,
} satisfies ConfirmationRequest;
