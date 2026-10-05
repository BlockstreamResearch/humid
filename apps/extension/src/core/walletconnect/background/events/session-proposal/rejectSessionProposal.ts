import type { WalletKitClient } from "../../types";
import { toJsonRpcError } from "../session-request/toJsonRpcError";

export async function rejectSessionProposal(
	walletKit: WalletKitClient,
	id: number,
	error: unknown,
): Promise<void> {
	const { code, message } = toJsonRpcError(error);
	await walletKit.rejectSession({
		id,
		reason: { code, message },
	});
}
