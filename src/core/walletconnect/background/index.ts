import { getSdkError } from "@walletconnect/utils";

import type {
	WalletConnectDisconnectInput,
	WalletConnectPairInput,
	WalletConnectStatus,
} from "../types";
import { getWalletKitClient } from "./client";
import { getErrorMessage } from "./errors";
import { getWalletConnectProjectId, MISSING_PROJECT_ID_ERROR } from "./project";
import { setBackgroundOptions, setLastError } from "./state";
import { getWalletConnectStatus } from "./status";
import type { WalletConnectBackgroundOptions } from "./types";
import { assertWalletConnectUri } from "./uri";

export {
	getRegisteredWalletConnectNamespaces,
	registerWalletConnectNamespaceAdapter,
} from "../capabilities";

export async function initializeWalletConnectBackground(
	options: WalletConnectBackgroundOptions = {},
): Promise<WalletConnectStatus> {
	setBackgroundOptions(options);

	if (!getWalletConnectProjectId()) {
		setLastError(MISSING_PROJECT_ID_ERROR);
		return getWalletConnectStatus();
	}

	try {
		await getWalletKitClient();
		setLastError(null);
	} catch (error) {
		setLastError(getErrorMessage(error));
	}

	return getWalletConnectStatus();
}

export async function pairWalletConnectUri(
	input: WalletConnectPairInput,
): Promise<WalletConnectStatus> {
	const uri = input.uri.trim();

	assertWalletConnectUri(uri);

	const walletKit = await getWalletKitClient();

	await walletKit.pair({ uri });

	return getWalletConnectStatus();
}

export async function disconnectWalletConnectSession(
	input: WalletConnectDisconnectInput,
): Promise<WalletConnectStatus> {
	const walletKit = await getWalletKitClient();

	await walletKit.disconnectSession({
		reason: getSdkError("USER_DISCONNECTED"),
		topic: input.topic,
	});

	return getWalletConnectStatus();
}

export { getWalletConnectStatus };
