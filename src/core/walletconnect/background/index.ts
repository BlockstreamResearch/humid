import { getSdkError } from "@walletconnect/utils";

import {
	getRegisteredWalletConnectNamespaces as readRegisteredWalletConnectNamespaces,
	registerWalletConnectNamespaceAdapter as registerNamespaceAdapter,
} from "../namespace-registry";
import type {
	WalletConnectDisconnectInput,
	WalletConnectPairInput,
	WalletConnectStatus,
} from "../types";
import type { WalletConnectNamespaceAdapter } from "../types";
import { getWalletKitClient } from "./client";
import { getErrorMessage } from "./errors";
import { getWalletConnectProjectId, MISSING_PROJECT_ID_ERROR } from "./project";
import { setBackgroundOptions, setLastError } from "./state";
import { getWalletConnectStatus as readWalletConnectStatus } from "./status";
import type { WalletConnectBackgroundOptions } from "./types";
import { assertWalletConnectUri } from "./uri";

export function registerWalletConnectNamespaceAdapter(
	adapter: WalletConnectNamespaceAdapter,
): () => void {
	return registerNamespaceAdapter(adapter);
}

export function getRegisteredWalletConnectNamespaces(): string[] {
	return readRegisteredWalletConnectNamespaces();
}

export async function initializeWalletConnectBackground(
	options: WalletConnectBackgroundOptions = {},
): Promise<WalletConnectStatus> {
	setBackgroundOptions(options);

	if (!getWalletConnectProjectId()) {
		setLastError(MISSING_PROJECT_ID_ERROR);
		return readWalletConnectStatus();
	}

	try {
		await getWalletKitClient();
		setLastError(null);
	} catch (error) {
		setLastError(getErrorMessage(error));
	}

	return readWalletConnectStatus();
}

export async function pairWalletConnectUri(
	input: WalletConnectPairInput,
): Promise<WalletConnectStatus> {
	const uri = input.uri.trim();

	assertWalletConnectUri(uri);

	const walletKit = await getWalletKitClient();

	await walletKit.pair({ uri });

	return readWalletConnectStatus();
}

export async function disconnectWalletConnectSession(
	input: WalletConnectDisconnectInput,
): Promise<WalletConnectStatus> {
	const walletKit = await getWalletKitClient();

	await walletKit.disconnectSession({
		reason: getSdkError("USER_DISCONNECTED"),
		topic: input.topic,
	});

	return readWalletConnectStatus();
}

export function getWalletConnectStatus(): WalletConnectStatus {
	return readWalletConnectStatus();
}
