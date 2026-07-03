import type {
	BackgroundEventBus,
	PegasusEventProtocolMap,
	WalletProviderEventPayload,
} from "@/core/extension-background/transport";
import { EventProtocolListeners } from "@/helpers/background";

/**
 * The wallet provider events broadcast to injected dapps: every key of the event protocol map
 * except the internal extension event. Hybrid scheme — EIP-1193 core (accountsChanged / chainChanged
 * / connect / disconnect) + CAIP-25 wallet_sessionChanged + the ELIP-1 chain-scoped
 * bip122_walletDescriptorChanged. See PegasusEventProtocolMap.
 */
export type WalletBroadcastEventName = Exclude<
	keyof PegasusEventProtocolMap,
	EventProtocolListeners.ExtensionEvent
>;

/** Fans a wallet event out to active WalletConnect sessions (point-to-point, per-session payload). */
export type WalletConnectEventSink = (
	event: WalletBroadcastEventName,
	payload: WalletProviderEventPayload,
) => void;

// Module singleton: one service worker owns one event bus. Set once at background startup; emits are
// no-ops until then (and if a broadcast throws, the state change that triggered it must not break).
let eventBus: BackgroundEventBus | null = null;
let walletConnectSink: WalletConnectEventSink | null = null;

/**
 * Wire the broadcaster to the captured background event bus (injected transport) and, optionally, a
 * WalletConnect sink (point-to-point transport). Call once, at init.
 */
export function initWalletEventBroadcaster(
	bus: BackgroundEventBus,
	walletConnectEventSink?: WalletConnectEventSink,
): void {
	eventBus = bus;
	walletConnectSink = walletConnectEventSink ?? null;
}

/**
 * Emit a wallet provider event to connected dapps over BOTH transports. The injected side is a GLOBAL
 * broadcast bus, so its payload carries only non-sensitive context (a chainId at most) — a dapp
 * re-queries the origin-scoped RPC for its own view. The WalletConnect sink, being point-to-point,
 * delivers each session its own scoped payload.
 */
export function emitWalletEvent(
	event: WalletBroadcastEventName,
	payload: WalletProviderEventPayload = {},
): void {
	void eventBus?.emitBroadcastEvent(event, payload);
	walletConnectSink?.(event, payload);
}
