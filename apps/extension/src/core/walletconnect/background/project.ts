import { config } from "@/config";

export const MISSING_PROJECT_ID_ERROR = "Missing VITE_WALLETCONNECT_PROJECT_ID.";

export function getWalletConnectProjectId(): string | undefined {
	return config.walletConnect.projectId;
}
