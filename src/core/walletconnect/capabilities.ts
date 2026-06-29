import type { WalletKitTypes } from "@reown/walletkit";
import { getSdkError, type SdkErrorKey } from "@walletconnect/utils";

import { getUnlockedKeyManagerState } from "@/core/vault/background";

import type { WalletConnectNamespaceAdapter, WalletConnectSupportedNamespaces } from "./types";

const namespaceAdapters = new Map<string, WalletConnectNamespaceAdapter>();

export class WalletConnectRequestError extends Error {
	readonly code: number;

	constructor(key: SdkErrorKey, context?: string | number) {
		const sdkError = getSdkError(key, context);

		super(sdkError.message);
		this.name = "WalletConnectRequestError";
		this.code = sdkError.code;
	}
}

export function registerWalletConnectNamespaceAdapter(
	adapter: WalletConnectNamespaceAdapter,
): () => void {
	const namespace = normalizeNamespace(adapter.namespace);

	if (!namespace) {
		throw new Error("WalletConnect namespace adapter requires a namespace.");
	}

	namespaceAdapters.set(namespace, adapter);

	return () => {
		namespaceAdapters.delete(namespace);
	};
}

export function getRegisteredWalletConnectNamespaces(): string[] {
	return [...namespaceAdapters.keys()].toSorted();
}

export async function resolveWalletConnectSupportedNamespaces(
	proposal: WalletKitTypes.SessionProposal["params"],
): Promise<WalletConnectSupportedNamespaces> {
	const keyManagerState = getUnlockedKeyManagerState();
	const requestedNamespaces = getRequestedNamespaces(proposal);
	const supportedNamespaceEntries = await Promise.all(
		requestedNamespaces.map(async (namespace) => {
			const adapter = namespaceAdapters.get(namespace);
			if (!adapter) return null;

			const supportedNamespace = await adapter.getSupportedNamespace(proposal, {
				keyManagerState,
			});
			if (!supportedNamespace) return null;

			return [namespace, supportedNamespace] as const;
		}),
	);

	return Object.fromEntries(supportedNamespaceEntries.filter((entry) => entry !== null));
}

export async function handleWalletConnectSessionRequest(
	event: WalletKitTypes.SessionRequest,
): Promise<unknown> {
	const keyManagerState = getUnlockedKeyManagerState();
	const namespace = normalizeNamespace(event.params.chainId);
	const adapter = namespaceAdapters.get(namespace);

	if (!adapter?.handleSessionRequest) {
		throw new WalletConnectRequestError("UNSUPPORTED_METHODS", event.params.request.method);
	}

	return adapter.handleSessionRequest(event, { keyManagerState });
}

function getRequestedNamespaces(proposal: WalletKitTypes.SessionProposal["params"]): string[] {
	const namespaceKeys = [
		...Object.keys(proposal.requiredNamespaces ?? {}),
		...Object.keys(proposal.optionalNamespaces ?? {}),
	];

	return [...new Set(namespaceKeys.map(normalizeNamespace).filter(Boolean))].toSorted();
}

function normalizeNamespace(namespace: string): string {
	return namespace.trim().split(":")[0] ?? "";
}
