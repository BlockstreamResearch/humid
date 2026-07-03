import type { WalletConnectNamespaceAdapter } from "./types";

const namespaceAdapters = new Map<string, WalletConnectNamespaceAdapter>();

export function registerWalletConnectNamespaceAdapter(
	adapter: WalletConnectNamespaceAdapter,
): () => void {
	const namespace = normalizeWalletConnectNamespace(adapter.namespace);

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

export function getWalletConnectNamespaceAdapter(
	namespace: string,
): WalletConnectNamespaceAdapter | null {
	return namespaceAdapters.get(normalizeWalletConnectNamespace(namespace)) ?? null;
}

export function normalizeWalletConnectNamespace(namespace: string): string {
	return namespace.trim().split(":")[0] ?? "";
}
