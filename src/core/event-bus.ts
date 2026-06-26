import type { DefaultToastPayload } from "@/ui/UiToaster";

type AppEventMap = {
	error: Partial<DefaultToastPayload>;
	warning: Partial<DefaultToastPayload>;
	success: Partial<DefaultToastPayload>;
	info: Partial<DefaultToastPayload>;
};

type AppEventName = keyof AppEventMap;
type AppEventListener<EventName extends AppEventName> = (payload: AppEventMap[EventName]) => void;

const listeners = new Map<AppEventName, Set<AppEventListener<AppEventName>>>();

export const emitter = {
	emit<EventName extends AppEventName>(eventName: EventName, payload: AppEventMap[EventName]) {
		listeners.get(eventName)?.forEach((listener) => {
			listener(payload);
		});
	},

	on<EventName extends AppEventName>(eventName: EventName, listener: AppEventListener<EventName>) {
		const eventListeners = listeners.get(eventName) ?? new Set<AppEventListener<AppEventName>>();

		eventListeners.add(listener as AppEventListener<AppEventName>);
		listeners.set(eventName, eventListeners);

		return () => {
			eventListeners.delete(listener as AppEventListener<AppEventName>);
		};
	},
};
