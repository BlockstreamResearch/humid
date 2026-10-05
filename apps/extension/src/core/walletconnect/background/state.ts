import type { WalletConnectRelayStatus } from "../types";
import type { WalletConnectBackgroundOptions, WalletKitClient } from "./types";

let walletKitClient: WalletKitClient | null = null;
let walletKitPromise: Promise<WalletKitClient> | null = null;
let relayStatus: WalletConnectRelayStatus = "unknown";
let lastError: string | null = null;
let listenersBound = false;
let backgroundOptions: WalletConnectBackgroundOptions = {};

export function setBackgroundOptions(options: WalletConnectBackgroundOptions): void {
	backgroundOptions = options;
}

export function getBackgroundOptions(): WalletConnectBackgroundOptions {
	return backgroundOptions;
}

export function getWalletKitClientState(): WalletKitClient | null {
	return walletKitClient;
}

export function setWalletKitClientState(client: WalletKitClient): void {
	walletKitClient = client;
}

export function getWalletKitPromiseState(): Promise<WalletKitClient> | null {
	return walletKitPromise;
}

export function setWalletKitPromiseState(promise: Promise<WalletKitClient> | null): void {
	walletKitPromise = promise;
}

export function getRelayStatus(): WalletConnectRelayStatus {
	return relayStatus;
}

export function setRelayStatus(status: WalletConnectRelayStatus): void {
	relayStatus = status;
}

export function getLastError(): string | null {
	return lastError;
}

export function setLastError(error: string | null): void {
	lastError = error;
}

export function areListenersBound(): boolean {
	return listenersBound;
}

export function markListenersBound(): void {
	listenersBound = true;
}
