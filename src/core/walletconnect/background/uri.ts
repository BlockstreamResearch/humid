export function assertWalletConnectUri(uri: string): void {
	if (!uri.startsWith("wc:")) {
		throw new Error("WalletConnect URI must start with wc:.");
	}
}
