import type { PagePorts } from "@/core/extension-background/page-port";
import type {
	PegasusEventProtocolMap,
	WalletProviderEventPayload,
} from "@/core/extension-background/transport";
import type { EventProtocolListeners } from "@/helpers/background";

export type WalletBroadcastEventName = Exclude<
	keyof PegasusEventProtocolMap,
	EventProtocolListeners.ExtensionEvent
>;

export type WalletConnectEventSink = (
	event: WalletBroadcastEventName,
	payload: WalletProviderEventPayload,
) => void;

let pages: PagePorts | null = null;
let walletConnectSink: WalletConnectEventSink | null = null;

export function initWalletEventBroadcaster(
	pagePorts: PagePorts,
	walletConnectEventSink?: WalletConnectEventSink,
): void {
	pages = pagePorts;
	walletConnectSink = walletConnectEventSink ?? null;
}

export function emitWalletEvent(
	event: WalletBroadcastEventName,
	payload: WalletProviderEventPayload = {},
): void {
	pages?.emit(event, payload);
	walletConnectSink?.(event, payload);
}
