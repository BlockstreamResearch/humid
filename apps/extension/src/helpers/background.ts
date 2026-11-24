import browser from "webextension-polyfill";

import type { TransactionReceiptData } from "@/common/Confirmation/TransactionReceipt";
import { logger } from "@/core/logger";
import { defaultZoom } from "@/helpers/surface";

export type ConfirmationRequest = {
	completes?: boolean;
	title: string;
	message?: string;
	confirmLabel?: string;
	data?: unknown;
	method?: string;
	requester?: { name?: string; origin: string };
};

export type ConfirmationDecision<TResult = unknown> = {
	approved: boolean;
	result?: TResult;
};

export type ConfirmationOutcome = { error: string } | { receipt: TransactionReceiptData };

export type ConfirmationCompletion = (choice: unknown) => Promise<TransactionReceiptData>;

export interface ExtensionMessage<T = unknown> {
	method: string;
	id?: number;
	data?: T;
	error?: unknown;
	type?: string;
}

let notificationWindowId: number | undefined;
let isClosingNotificationByUserAction = false;
let openingNotification: Promise<number> | undefined;

const NOTIFICATION_CONTENT_WIDTH = 400;
const NOTIFICATION_CONTENT_HEIGHT = 600;
const NOTIFICATION_WINDOW_FRAME_WIDTH_OFFSET = 32;
const NOTIFICATION_WINDOW_FRAME_HEIGHT_OFFSET = 80;

export function openNotification(url = ""): Promise<number> {
	if (!openingNotification) {
		openingNotification = createOrFocusNotification(url).finally(() => {
			openingNotification = undefined;
		});
	}
	return openingNotification;
}

async function createOrFocusNotification(url: string): Promise<number> {
	const placed = await getNotificationWindowOptions();
	// Chrome refuses a position mostly off-screen, as next to a browser window wider than the display.
	const unplaced = { focused: true, height: placed.height, width: placed.width };
	const notificationWindow = await getNotification();

	if (notificationWindow?.id !== undefined) {
		const id = notificationWindow.id;

		await browser.windows.update(id, placed).catch(() => browser.windows.update(id, unplaced));
		return id;
	}

	const create = (options: browser.Windows.UpdateUpdateInfoType) =>
		browser.windows.create({ url: getNotificationUrl(url), type: "popup", ...options });
	const createdWindow = await create(placed).catch(() => create(unplaced));

	notificationWindowId = createdWindow.id;
	return createdWindow.id ?? -1;
}

async function getNotificationWindowOptions(): Promise<browser.Windows.UpdateUpdateInfoType> {
	const zoom = await defaultZoom();
	const width =
		Math.round(NOTIFICATION_CONTENT_WIDTH * zoom) + NOTIFICATION_WINDOW_FRAME_WIDTH_OFFSET;
	const height =
		Math.round(NOTIFICATION_CONTENT_HEIGHT * zoom) + NOTIFICATION_WINDOW_FRAME_HEIGHT_OFFSET;
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

export function initNotificationManagement(onUnexpectedClose?: () => void): void {
	browser.windows.onRemoved.addListener((windowId) => {
		if (windowId !== notificationWindowId) return;

		notificationWindowId = undefined;

		if (!isClosingNotificationByUserAction) {
			logger.warn("Notification closed unexpectedly. Clean up pending operations.");
			onUnexpectedClose?.();
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

export enum MsgProtocolRequestMethods {
	Request = "request",
	RequestConfirmation = "requestConfirmation",
	ShowOutcome = "showOutcome",
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
