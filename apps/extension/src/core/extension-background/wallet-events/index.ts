import type {
	BackgroundEventBus,
	PegasusEventProtocolMap,
	WalletProviderEventPayload,
} from "@/core/extension-background/transport";
import { EventProtocolListeners } from "@/helpers/background";

export type WalletBroadcastEventName = Exclude<
	keyof PegasusEventProtocolMap,
	EventProtocolListeners.ExtensionEvent
>;

export type WalletConnectEventSink = (
	event: WalletBroadcastEventName,
	payload: WalletProviderEventPayload,
) => void;

let eventBus: BackgroundEventBus | null = null;
let walletConnectSink: WalletConnectEventSink | null = null;

export function initWalletEventBroadcaster(
	bus: BackgroundEventBus,
	walletConnectEventSink?: WalletConnectEventSink,
): void {
	eventBus = bus;
	walletConnectSink = walletConnectEventSink ?? null;
}

export function emitWalletEvent(
	event: WalletBroadcastEventName,
	payload: WalletProviderEventPayload = {},
): void {
	void eventBus?.emitBroadcastEvent(event, payload);
	walletConnectSink?.(event, payload);
}
