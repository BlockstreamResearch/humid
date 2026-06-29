import type { PegasusRPCMessage } from "@webext-pegasus/rpc";
import browser from "webextension-polyfill";

export type ConfirmationRequest = {
	title: string;
	message?: string;
	data?: unknown;
};

export interface ExtensionMessage<T = unknown> {
	method: string;
	id?: number;
	data?: T;
	error?: unknown;
	type?: string;
}

let notificationWindowId: number | undefined;
let isClosingNotificationByUserAction = false;

const NOTIFICATION_CONTENT_WIDTH = 400;
const NOTIFICATION_CONTENT_HEIGHT = 600;
const NOTIFICATION_WINDOW_FRAME_WIDTH_OFFSET = 32;
const NOTIFICATION_WINDOW_FRAME_HEIGHT_OFFSET = 80;

export async function openNotification(url = ""): Promise<number> {
	const windowOptions = await getNotificationWindowOptions();
	const notificationWindow = await getNotification();

	if (notificationWindow?.id !== undefined) {
		await browser.windows.update(notificationWindow.id, { ...windowOptions, focused: true });
		return notificationWindow.id;
	}

	const createdWindow = await browser.windows.create({
		url: getNotificationUrl(url),
		focused: true,
		type: "popup",
		...windowOptions,
	});

	notificationWindowId = createdWindow.id;
	return createdWindow.id ?? -1;
}

async function getNotificationWindowOptions(): Promise<browser.Windows.UpdateUpdateInfoType> {
	const width = NOTIFICATION_CONTENT_WIDTH + NOTIFICATION_WINDOW_FRAME_WIDTH_OFFSET;
	const height = NOTIFICATION_CONTENT_HEIGHT + NOTIFICATION_WINDOW_FRAME_HEIGHT_OFFSET;
	const anchorWindow = await getNotificationAnchorWindow();
	const left = Math.round((anchorWindow.left ?? 0) + (anchorWindow.width ?? width) - width);

	const windowOptions: browser.Windows.UpdateUpdateInfoType = {
		focused: true,
		height,
		left,
		state: "normal",
		width,
	};

	if (anchorWindow.top !== undefined) {
		windowOptions.top = anchorWindow.top;
	}

	return windowOptions;
}

async function getNotificationAnchorWindow(): Promise<browser.Windows.Window> {
	const normalWindows = await browser.windows.getAll({ windowTypes: ["normal"] });

	return normalWindows.find((window) => window.focused) ?? browser.windows.getLastFocused();
}

function getNotificationUrl(url: string): string {
	return `src/notification.html${url}`;
}

export async function getNotification(): Promise<browser.Windows.Window | null> {
	const windows = await browser.windows.getAll();
	return (
		windows.find((window) => window.type === "popup" && window.id === notificationWindowId) ?? null
	);
}

export function initNotificationManagement(): void {
	browser.windows.onRemoved.addListener((windowId) => {
		if (windowId !== notificationWindowId) return;

		notificationWindowId = undefined;

		if (!isClosingNotificationByUserAction) {
			console.warn("Notification closed unexpectedly. Clean up pending operations.");
		}

		isClosingNotificationByUserAction = false;
	});
}

export function updateBadge(count = 0): void {
	const browserWithBrowserAction = browser as typeof browser & {
		browserAction?: typeof browser.action;
	};
	const actionApi = browserWithBrowserAction.action ?? browserWithBrowserAction.browserAction;

	if (!actionApi) return;

	const label = count ? String(count) : "";

	void actionApi.setBadgeText({ text: label });
	void actionApi.setBadgeBackgroundColor({ color: "#01579b" });
}

export function updateBadgeOnStorageChange(): void {
	browser.storage.onChanged.addListener(() => {
		updateBadge();
	});
}

export type ISelfIDService = typeof getSelfIDService;

export async function getSelfIDService(message: PegasusRPCMessage): Promise<{
	tabId: number;
	frameId?: number;
}> {
	let tabId: number | undefined = message.sender.tabId;

	if (message.sender.context === "popup") {
		tabId = (await browser.tabs.query({ active: true, currentWindow: true }))[0]?.id;
	}

	if (tabId === undefined) {
		throw new Error(`Could not get tab ID for message: ${String(message)}`);
	}

	return { frameId: message.sender.frameId, tabId };
}

export enum MsgProtocolRequestMethods {
	Request = "request",
	RequestConfirmation = "requestConfirmation",
}

export enum MsgProtocolResponseMethods {
	ConfirmResponse = "CONFIRM_RESPONSE",
	RequestResponse = "request_response",
}

export enum EventProtocolListeners {
	ExtensionEvent = "extension_event",
}

export async function closeNotification(id: number) {
	if (id < 0) return;

	isClosingNotificationByUserAction = true;
	await browser.windows.remove(id);
}
